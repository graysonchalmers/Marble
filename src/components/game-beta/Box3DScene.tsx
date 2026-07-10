/**
 * Box3DScene.tsx — render + glue layer for the Box3D beta.
 *
 * All gameplay simulation lives in systems/sim/MarbleSim.ts (headless,
 * fixed-timestep). This component only:
 *  1. Boots the WASM bridge and constructs the sim.
 *  2. Captures input into a mutable ref (no re-renders per keypress).
 *  3. Drives ONE GameLoop (sim → rules → sonar) from useFrame.
 *  4. Interpolates prev→curr sim snapshots by the loop's alpha for rendering.
 *  5. Handles camera/light follow, audio listener, and throttled store sync.
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Sky } from '@react-three/drei'
import { Box3DWorld } from '../../physics/box3d/Box3DWorld'
import { loadBox3DBridge, loadBox3DBridgeModule } from '../../physics/box3d/box3dBridge'
import { useGameStore } from '../../store/useGameStore'
import { soundManager } from '../../audio/SoundManager'
import { GameLoop } from '../../engine/loop'
import { rulesSystem } from '../../systems/rules/RulesSystem'
import { SonarSystem } from '../../systems/sonar/SonarSystem'
import { MarbleSim, type SimInput } from '../../systems/sim/MarbleSim'
import { SIM_RATE_HZ, TERRAIN, PHYSICS_PRESETS } from '../../systems/sim/tuning'
import { getStateVisuals, type EnemyState } from '../../systems/ai/EnemyAI'
import { CubeOcclusion } from './CubeOcclusion'
import { ObstacleOcclusion } from './ObstacleOcclusion'
import { Box3DParticles, dispatchFx } from './Box3DParticles'

// Terrain constants (physics reads these via tuning.ts; visuals share them here)
const WIDTH = TERRAIN.width
const DEPTH = TERRAIN.depth
const SCALE = TERRAIN.scale

function generateTerrainHeights(): Float32Array {
    const heights = new Float32Array(WIDTH * DEPTH)
    let i = 0
    for (let z = 0; z < DEPTH; z++) {
        for (let x = 0; x < WIDTH; x++) {
            const xn = (x / WIDTH) * 5
            const zn = (z / DEPTH) * 5
            heights[i++] = Math.sin(xn * 1.5) * Math.cos(zn * 1.5) * 2.5 + Math.sin(xn * 4 + zn * 2) * 0.8
        }
    }
    return heights
}

function useGridTexture(colorBg: string, colorGrid: string, gridStep: number = 64) {
    return useMemo(() => {
        const RES = 512
        const canvas = document.createElement('canvas')
        canvas.width = RES
        canvas.height = RES
        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.fillStyle = colorBg
            ctx.fillRect(0, 0, RES, RES)
            ctx.beginPath()
            ctx.strokeStyle = colorGrid
            ctx.lineWidth = 4
            for (let i = 0; i <= RES; i += gridStep) {
                ctx.moveTo(i, 0); ctx.lineTo(i, RES)
                ctx.moveTo(0, i); ctx.lineTo(RES, i)
            }
            ctx.stroke()
        }
        const tex = new THREE.CanvasTexture(canvas)
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.RepeatWrapping
        return tex
    }, [colorBg, colorGrid, gridStep])
}

// Higher-fidelity grid texture matching the legacy FallingCubes look (v1 Level.tsx):
// sharp minor/major line hierarchy at 2048px so edges stay crisp at close range.
function useCubeGridTexture(colorBg: string, colorGrid: string, gridStep: number = 64) {
    return useMemo(() => {
        const RES = 2048
        const canvas = document.createElement('canvas')
        canvas.width = RES
        canvas.height = RES
        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.fillStyle = colorBg
            ctx.fillRect(0, 0, RES, RES)

            // Snap gridStep to a clean divisor of 512 for perfect tiling.
            const numCells = Math.round(512 / gridStep)
            const adjustedGridStep = 512 / Math.max(1, numCells)
            const scale = RES / 512
            const scaledStep = adjustedGridStep * scale
            const scaledMinorStep = scaledStep / 2

            // Minor lines (subtle).
            ctx.beginPath()
            ctx.strokeStyle = colorGrid
            ctx.globalAlpha = 0.3
            ctx.lineWidth = 2 * scale
            for (let i = 0; i <= RES; i += scaledMinorStep) {
                if (i % scaledStep !== 0) {
                    ctx.moveTo(i, 0); ctx.lineTo(i, RES)
                    ctx.moveTo(0, i); ctx.lineTo(RES, i)
                }
            }
            ctx.stroke()

            // Major lines (strong).
            ctx.beginPath()
            ctx.globalAlpha = 1.0
            ctx.lineWidth = 4 * scale
            for (let i = 0; i <= RES; i += scaledStep) {
                ctx.moveTo(i, 0); ctx.lineTo(i, RES)
                ctx.moveTo(0, i); ctx.lineTo(RES, i)
            }
            ctx.stroke()
        }
        const tex = new THREE.CanvasTexture(canvas)
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.RepeatWrapping
        tex.anisotropy = 16
        return tex
    }, [colorBg, colorGrid, gridStep])
}

type PlayableSceneProps = {
    sim: MarbleSim
    keys: React.MutableRefObject<SimInput>
    heights: Float32Array
}

function Box3DPlayableScene({ sim, keys, heights }: PlayableSceneProps) {
    const sphereRef = useRef<THREE.Mesh>(null)
    const enemyRef = useRef<THREE.Mesh>(null)
    const cubesRef = useRef<THREE.InstancedMesh>(null)
    const columnsRef = useRef<THREE.InstancedMesh>(null)

    // Store settings/state
    const enemySize = useGameStore(s => s.enemySize)
    const gameState = useGameStore(s => s.gameState)
    const isPaused = useGameStore(s => s.isPaused)
    const cubeGridSize = useGameStore(s => s.cubeGridSize)
    const cubeColorBg = useGameStore(s => s.cubeColorBg)
    const cubeColorGrid = useGameStore(s => s.cubeColorGrid)
    // Ground look (Settings → Visuals) — previously hardcoded, now live.
    const groundColorBg = useGameStore(s => s.groundColorBg)
    const groundColorGrid = useGameStore(s => s.groundColorGrid)
    const groundGridSize = useGameStore(s => s.groundGridSize)
    // Camera feel (Settings → Camera & Graphics) — previously hardcoded 6/11, now live.
    const cameraStiffness = useGameStore(s => s.cameraStiffness)
    const cameraOffset = useGameStore(s => s.cameraOffset)
    // See-through obstacle reveal style (Settings → Visuals).
    const occlusionMode = useGameStore(s => s.occlusionMode)

    const [currentState, setCurrentState] = useState<EnemyState>('idle')

    // Early-release latch: set true the first frame the player presses a control key
    // during the countdown, so they break free for a head start (enemy stays frozen).
    // Reset whenever we (re)enter setup/countdown.
    const earlyReleasedRef = useRef(false)

    // --- The single fixed-timestep loop: sim → rules → sonar ---
    const loop = useMemo(() => new GameLoop({ simRate: SIM_RATE_HZ }), [])
    const sonarSystem = useMemo(() => new SonarSystem(sim.playerPosRef, sim.enemyPosRef), [sim])

    // Register ticks once. Tick fns read the store imperatively so the loop
    // never needs re-registration on state changes.
    useEffect(() => {
        const tickSim = (dt: number) => {
            const s = useGameStore.getState()
            const params = {
                enemySpeed: s.enemySpeed,
                enemyAirControl: s.enemyAirControl,
                playerDrift: s.playerDrift,
                downhillRoll: s.downhillRoll,
                jumpHeight: s.jumpHeight,
                moveTopSpeed: s.moveTopSpeed,
                moveAccel: s.moveAccel,
                moveBrakeDecel: s.moveBrakeDecel,
                moveAirControl: s.moveAirControl,
                enemyVelUnit: s.enemyVelUnit,
                enemyVelAccel: s.enemyVelAccel
            }
            if (s.gameState === 'setup') {
                sim.resetPositions()
                return
            }
            if (s.gameState === 'countdown') {
                // Early release: the first control-key press during the countdown breaks the
                // player free for a head start; the enemy stays pinned at spawn (freezeEnemy)
                // until the timer hits zero and RulesSystem flips gameState to 'playing'.
                const k = keys.current
                if (!earlyReleasedRef.current && (k.w || k.a || k.s || k.d || k.space)) {
                    earlyReleasedRef.current = true
                }
                if (!earlyReleasedRef.current) {
                    sim.resetPositions()
                    return
                }
                sim.step(dt, k, { ...params, freezeEnemy: true })
                return
            }
            sim.step(dt, keys.current, params)
        }
        const tickRules = (dt: number) => rulesSystem.tick(dt)
        const tickSonar = (dt: number) => sonarSystem.tick(dt)

        loop.addTick(tickSim)
        loop.addTick(tickRules)
        loop.addTick(tickSonar)
        return () => {
            loop.removeTick(tickSim)
            loop.removeTick(tickRules)
            loop.removeTick(tickSonar)
            loop.stop()
        }
    }, [loop, sonarSystem, sim, keys])

    // Mirror sim AI-state events into React for enemy material visuals.
    useEffect(() => {
        const unsub = subscribeSimEvents(sim, setCurrentState)
        return unsub
    }, [sim])

    // Sonar audio lifecycle
    useEffect(() => {
        if (gameState === 'playing' && !isPaused) {
            soundManager.startSonar()
            soundManager.startMovementAudio()
        } else {
            soundManager.stopSonar()
            soundManager.stopMovementAudio()
        }
        return () => { soundManager.stopSonar(); soundManager.stopMovementAudio() }
    }, [gameState, isPaused])

    // Reset loop + systems on restart/setup
    useEffect(() => {
        if (gameState === 'setup' || gameState === 'countdown') {
            loop.reset()
            rulesSystem.reset()
            sonarSystem.reset()
            earlyReleasedRef.current = false
        }
    }, [gameState, loop, sonarSystem])

    // Render-side smoothing state (camera only — bodies use exact interpolation)
    const smoothedCamTarget = useRef(new THREE.Vector3(0, 6, 0))
    const lightRef = useRef<THREE.DirectionalLight>(null)
    const lightTarget = useRef<THREE.Object3D>(null)

    // Scratchpads
    const tempPos = useRef(new THREE.Vector3())
    const tempQuat = useRef(new THREE.Quaternion())
    const tempTargetCamPos = useRef(new THREE.Vector3())
    const tempOffset = useRef(new THREE.Vector3())
    const uiSyncClock = useRef(0)

    // Live interpolated player render position, shared with occlusion + particles.
    const playerRenderPosRef = useRef(new THREE.Vector3())

    // Live interpolated enemy render position, shared with particles (enemy roll trail + ground breadcrumb).
    const enemyRenderPosRef = useRef(new THREE.Vector3())

    // Procedural terrain mesh (visual)
    const geom = useMemo(() => {
        const geometry = new THREE.PlaneGeometry(
            (WIDTH - 1) * SCALE,
            (DEPTH - 1) * SCALE,
            WIDTH - 1,
            DEPTH - 1
        )
        const posAttribute = geometry.attributes.position
        for (let i = 0; i < posAttribute.count; i++) {
            posAttribute.setZ(i, heights[i])
        }
        geometry.computeVertexNormals()
        return geometry
    }, [heights])

    const terrainTexture = useGridTexture(groundColorBg, groundColorGrid, groundGridSize)
    terrainTexture.repeat.set(WIDTH / 4, DEPTH / 4)

    // Cube obstacles: v1-matching grid texture, applied uniformly to every instance.
    const cubeTexture = useCubeGridTexture(cubeColorBg, cubeColorGrid, cubeGridSize)

    // Cubes are static (never move post-spawn) — set instance matrices once per
    // sim construction rather than every frame. Compose position + terrain-tilt
    // orientation (sim.cubeQuaternions) so cubes sit flush along the slope.
    useEffect(() => {
        const mesh = cubesRef.current
        if (!mesh || sim.cubePositions.length === 0) return
        const matrix = new THREE.Matrix4()
        const scaleOne = new THREE.Vector3(1, 1, 1)
        const identQ = new THREE.Quaternion()
        sim.cubePositions.forEach((pos, i) => {
            matrix.compose(pos, sim.cubeQuaternions[i] ?? identQ, scaleOne)
            mesh.setMatrixAt(i, matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
    }, [sim])

    // Columns are static too — set their instance matrices once per sim construction,
    // tilted to the terrain normal like the cubes.
    useEffect(() => {
        const mesh = columnsRef.current
        if (!mesh || sim.columnPositions.length === 0) return
        const matrix = new THREE.Matrix4()
        const scaleOne = new THREE.Vector3(1, 1, 1)
        const identQ = new THREE.Quaternion()
        sim.columnPositions.forEach((pos, i) => {
            matrix.compose(pos, sim.columnQuaternions[i] ?? identQ, scaleOne)
            mesh.setMatrixAt(i, matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
    }, [sim])

    const ballTexture = useMemo(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 128
        canvas.height = 128
        const context = canvas.getContext('2d')
        if (context) {
            context.fillStyle = '#24d6a2'
            context.fillRect(0, 0, 128, 128)
            context.fillStyle = '#178a67'
            context.fillRect(0, 48, 128, 32)
            context.fillRect(48, 0, 32, 128)
        }
        return new THREE.CanvasTexture(canvas)
    }, [])

    const enemyTexture = useMemo(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 256
        canvas.height = 256
        const context = canvas.getContext('2d')
        if (context) {
            context.fillStyle = '#ff3333'
            context.fillRect(0, 0, 256, 256)
            context.fillStyle = '#660000'
            context.fillRect(0, 100, 256, 56)
            context.fillRect(100, 0, 56, 256)
            context.beginPath()
            context.arc(60, 60, 25, 0, Math.PI * 2)
            context.fillStyle = '#ffffff'
            context.fill()
            context.strokeStyle = '#990000'
            context.lineWidth = 8
            for (let i = -256; i < 512; i += 40) {
                context.beginPath()
                context.moveTo(i, 0)
                context.lineTo(i + 256, 256)
                context.stroke()
            }
        }
        return new THREE.CanvasTexture(canvas)
    }, [])

    useFrame((state, delta) => {
        if (isPaused) return

        const clampedDelta = Math.min(delta, 0.05)

        // Advance the fixed-step loop (runs 0..N sim/rules/sonar ticks).
        loop.advance(clampedDelta)
        const alpha = loop.alpha

        // --- Exact render interpolation: prev → curr by alpha ---
        if (sphereRef.current) {
            tempPos.current.lerpVectors(sim.playerPrev.position, sim.playerCurr.position, alpha)
            tempQuat.current.slerpQuaternions(sim.playerPrev.quaternion, sim.playerCurr.quaternion, alpha)
            sphereRef.current.position.copy(tempPos.current)
            sphereRef.current.quaternion.copy(tempQuat.current)
            playerRenderPosRef.current.copy(tempPos.current)
        }

        if (enemyRef.current) {
            tempPos.current.lerpVectors(sim.enemyPrev.position, sim.enemyCurr.position, alpha)
            tempQuat.current.slerpQuaternions(sim.enemyPrev.quaternion, sim.enemyCurr.quaternion, alpha)
            enemyRef.current.position.copy(tempPos.current)
            enemyRef.current.quaternion.copy(tempQuat.current)
            enemyRenderPosRef.current.copy(tempPos.current)
        }

        // --- Camera follow (render-side smoothing) --- stiffness + distance are live store settings.
        const playerRenderPos = sphereRef.current ? sphereRef.current.position : sim.playerCurr.position
        const cameraDelta = Math.min(clampedDelta, 0.033)
        const smoothFactor = 1 - Math.exp(-cameraStiffness * cameraDelta)
        smoothedCamTarget.current.lerp(playerRenderPos, smoothFactor * 2)

        tempOffset.current.set(0, cameraOffset * 0.5, cameraOffset)
        tempTargetCamPos.current.copy(smoothedCamTarget.current).add(tempOffset.current)
        state.camera.position.lerp(tempTargetCamPos.current, smoothFactor)
        state.camera.lookAt(smoothedCamTarget.current)

        // --- Light follow ---
        if (lightRef.current && lightTarget.current) {
            lightRef.current.position.set(
                playerRenderPos.x + 17.5,
                playerRenderPos.y + 28.0,
                playerRenderPos.z + 14.0
            )
            lightTarget.current.position.copy(playerRenderPos)
            lightRef.current.target = lightTarget.current
            lightRef.current.updateMatrixWorld()
            lightTarget.current.updateMatrixWorld()
        }

        // --- Audio listener + movement audio + throttled store position sync (30Hz) ---
        if (gameState === 'playing') {
            soundManager.updateListener(state.camera)
            // Rolling rumble + wind whoosh track the ball's speed (nodes are torn down on
            // pause, so this is a no-op while paused even though gameState is still 'playing').
            soundManager.updateMovementAudio(
                Math.hypot(sim.playerVel.x, sim.playerVel.z),
                sim.playerVel.length(),
                sim.playerGrounded
            )
        }
        uiSyncClock.current += clampedDelta
        if (uiSyncClock.current >= 0.033) {
            uiSyncClock.current = 0
            useGameStore.setState({
                playerPosition: {
                    x: sim.playerCurr.position.x,
                    y: sim.playerCurr.position.y,
                    z: sim.playerCurr.position.z
                },
                enemyPosition: {
                    x: sim.enemyCurr.position.x,
                    y: sim.enemyCurr.position.y,
                    z: sim.enemyCurr.position.z
                }
            })
        }
    })

    const enemyVisuals = getStateVisuals(currentState)

    return (
        <>
            <ambientLight intensity={0.4} />
            <directionalLight
                ref={lightRef}
                intensity={1.2}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-40}
                shadow-camera-right={40}
                shadow-camera-top={40}
                shadow-camera-bottom={-40}
                shadow-camera-near={0.5}
                shadow-camera-far={100}
            />
            <object3D ref={lightTarget} />

            <Sky
                turbidity={2}
                rayleigh={1}
                mieCoefficient={0.005}
                mieDirectionalG={0.8}
                sunPosition={[17.5, 28, 14]}
            />
            <Environment preset="sunset" />

            {/* Terrain Visual Mesh */}
            <mesh receiveShadow geometry={geom} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                <meshStandardMaterial map={terrainTexture} roughness={0.7} metalness={0.1} />
            </mesh>

            {/* Cube Obstacles (static, positions set once from sim.cubePositions) */}
            {sim.cubePositions.length > 0 && (
                <instancedMesh
                    ref={cubesRef}
                    args={[undefined, undefined, sim.cubePositions.length]}
                    castShadow
                    receiveShadow
                >
                    {/* Physics-authoritative scale from the sim — NOT the live store value,
                        which can drift from the colliders built at sim construction. */}
                    <boxGeometry args={[sim.cubeScale, sim.cubeScale, sim.cubeScale]} />
                    <meshStandardMaterial map={cubeTexture} />
                </instancedMesh>
            )}

            {/* Column Obstacles (tall static pillars, positions set once from sim.columnPositions).
                Rendered as actual CYLINDERS (radius = columnSize/2, height = columnHeight) — the
                physics collider stays a square-footprint box (the Box3D bridge has no cylinder
                primitive; a true round collider needs a bridge primitive + WASM rebuild → backlog).
                Cylinder is Y-up + center-origin like the box, so the same tilt matrices apply.
                Physics-authoritative dims from the sim — NOT the live store values. Columns ARE
                camera-occluded (session 16) via ObstacleOcclusion with a non-uniform AABB
                (columnSize × columnHeight × columnSize) and a cylinder reveal — see below. */}
            {sim.columnPositions.length > 0 && (
                <instancedMesh
                    ref={columnsRef}
                    args={[undefined, undefined, sim.columnPositions.length]}
                    castShadow
                    receiveShadow
                >
                    <cylinderGeometry args={[sim.columnSize / 2, sim.columnSize / 2, sim.columnHeight, 20]} />
                    <meshStandardMaterial map={cubeTexture} color="#b8b0c8" />
                </instancedMesh>
            )}

            {/* Player Sphere Visual Mesh */}
            <mesh ref={sphereRef} castShadow>
                <sphereGeometry args={[0.5, 32, 16]} />
                <meshStandardMaterial map={ballTexture} roughness={0.3} metalness={0.4} />
            </mesh>

            {/* Enemy Sphere Visual Mesh */}
            <mesh ref={enemyRef} castShadow>
                <sphereGeometry args={[enemySize, 32, 32]} />
                <meshStandardMaterial
                    map={enemyTexture}
                    color="#ffffff"
                    metalness={0.6}
                    roughness={0.3}
                    emissive={enemyVisuals.emissive}
                    emissiveIntensity={0.5}
                />
            </mesh>

            {/* See-through cubes: fade obstacles blocking the camera→player sightline */}
            {sim.cubePositions.length > 0 && (
                <CubeOcclusion
                    cubesRef={cubesRef}
                    centers={sim.cubePositions}
                    quaternions={sim.cubeQuaternions}
                    cubeScale={sim.cubeScale}
                    texture={cubeTexture}
                    playerPosRef={playerRenderPosRef}
                    mode={occlusionMode}
                />
            )}

            {/* See-through columns: same reveal modes as cubes, non-uniform AABB + cylinder reveal.
                Detection uses the square-footprint box (matches the physics collider); the reveal
                draws the cylinder to match the visual. Lavender tint mirrors the solid pillars. */}
            {sim.columnPositions.length > 0 && (
                <ObstacleOcclusion
                    meshRef={columnsRef}
                    centers={sim.columnPositions}
                    quaternions={sim.columnQuaternions}
                    shape={{ kind: 'cylinder', radius: sim.columnSize / 2, height: sim.columnHeight }}
                    texture={cubeTexture}
                    playerPosRef={playerRenderPosRef}
                    mode={occlusionMode}
                    color="#b8b0c8"
                />
            )}

            {/* Cosmetic particle FX: player + enemy roll trails, impact/landing bursts, enemy ground breadcrumb */}
            <Box3DParticles sim={sim} playerPosRef={playerRenderPosRef} enemyPosRef={enemyRenderPosRef} />

            {/* Fog background color matched to sky horizon */}
            <color attach="background" args={["#cbdbe6"]} />
            <fog attach="fog" args={["#cbdbe6", 30, 110]} />
        </>
    )
}

/**
 * Bridges MarbleSim events to sounds/store/HUD. Events are registered at sim
 * construction (see boot()); this hook only mirrors AI state into React.
 */
const simStateListeners = new WeakMap<MarbleSim, (s: EnemyState) => void>()

function subscribeSimEvents(sim: MarbleSim, setState: (s: EnemyState) => void): () => void {
    simStateListeners.set(sim, setState)
    return () => { simStateListeners.delete(sim) }
}

export function Box3DScene() {
    const [status, setStatus] = useState<{ loaded: boolean; error?: string }>({ loaded: false })
    const [sim, setSim] = useState<MarbleSim | null>(null)
    // Physics feel preset (traction A/B). Reactive so changing it rebuilds the world+sim below.
    const physicsPreset = useGameStore(s => s.physicsPreset)

    // Arena/enemy settings that are baked at sim construction. Reactive so changing them in
    // Settings → Environment / Gameplay rebuilds the world+sim (Known #5 fix: previously these
    // only ever applied at the first boot — restart didn't remount, so they looked "dead").
    const cubeCount = useGameStore(s => s.cubeCount)
    const cubeScale = useGameStore(s => s.cubeScale)
    const columnCount = useGameStore(s => s.columnCount)
    const columnSize = useGameStore(s => s.columnSize)
    const columnHeight = useGameStore(s => s.columnHeight)
    const enemySize = useGameStore(s => s.enemySize)
    const enemyMass = useGameStore(s => s.enemyMass)

    // Stable obstacle-scatter seed for this page session: rebuilds triggered by a settings
    // change keep the SAME layout (only the changed dimension updates) instead of reshuffling
    // every obstacle on each slider tick. Re-randomizes on a fresh page load.
    const seedRef = useRef<number | null>(null)
    if (seedRef.current === null) seedRef.current = Math.floor(Math.random() * 0x7fffffff)

    // Render-loop gating: while paused or on the game-over screen the sim is frozen, so
    // there's nothing new to draw. Switch R3F to on-demand rendering to stop the GPU
    // spinning a static frame ~60×/s; it renders one last frame then idles the rAF loop
    // until we flip back to 'always'. This is the "stop updating graphics to save perf" ask.
    const isPaused = useGameStore(s => s.isPaused)
    const gameState = useGameStore(s => s.gameState)
    const frozen = isPaused || gameState === 'gameover'
    const shadowsEnabled = useGameStore(s => s.shadowsEnabled)

    // Input captured into a ref — zero React re-renders on keypress.
    const keys = useRef<SimInput>({ w: false, a: false, s: false, d: false, space: false, shift: false })

    const heights = useMemo(() => generateTerrainHeights(), [])

    useEffect(() => {
        const set = (key: string, down: boolean) => {
            const k = keys.current
            switch (key) {
                case 'w': case 'arrowup': k.w = down; break
                case 's': case 'arrowdown': k.s = down; break
                case 'a': case 'arrowleft': k.a = down; break
                case 'd': case 'arrowright': k.d = down; break
                case ' ': k.space = down; break
                case 'shift': k.shift = down; break
            }
        }
        const handleKeyDown = (e: KeyboardEvent) => { if (!e.repeat) set(e.key.toLowerCase(), true) }
        const handleKeyUp = (e: KeyboardEvent) => set(e.key.toLowerCase(), false)
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [])

    // Boot WASM physics + construct the headless sim.
    useEffect(() => {
        let active = true
        let worldInstance: Box3DWorld | null = null

        async function boot() {
            const probe = await loadBox3DBridge()
            if (!active) return
            if (!probe.available) {
                setStatus({ loaded: false, error: probe.headline })
                return
            }

            const bridge = await loadBox3DBridgeModule()
            if (!active) return

            worldInstance = new Box3DWorld(bridge)
            // A rapid settings change (e.g. dragging a slider) can supersede this boot
            // after the world is created but before the cleanup captured it — destroy it
            // here so quick rebuilds don't leak WASM worlds.
            if (!active) { worldInstance.destroy(); worldInstance = null; return }

            const storeState = useGameStore.getState()
            // Resolve the selected physics feel preset. Gravity is applied to the world
            // here (set at creation); friction + jump ride into the sim via `physics` below.
            const physics = PHYSICS_PRESETS[storeState.physicsPreset] ?? PHYSICS_PRESETS.current

            worldInstance.reset(physics.gravityY) // Clears default smoke scene + applies preset gravity

            const simInstance = new MarbleSim(worldInstance, {
                heights,
                enemySize: storeState.enemySize,
                enemyMass: storeState.enemyMass,
                physics,
                // Stable per-session seed (seedRef) so a settings-driven rebuild keeps the
                // same layout; sim.seed records it so a future replay system can reproduce
                // this exact run (F9).
                seed: seedRef.current ?? 0,
                obstacles: {
                    cubeCount: storeState.cubeCount,
                    cubeScale: storeState.cubeScale,
                    // Tall pillars (Obst-2) — live-tunable in SettingsMenu → Environment (apply on restart).
                    columnCount: storeState.columnCount,
                    columnSize: storeState.columnSize,
                    columnHeight: storeState.columnHeight
                },
                events: {
                    onTag: () => {
                        const s = useGameStore.getState()
                        if (s.gameState === 'playing') {
                            soundManager.playBonkSound()
                            s.setGameState('gameover')
                        }
                    },
                    onAIStateChange: (prev, next) => {
                        useGameStore.setState({ enemyAIState: next })
                        simStateListeners.get(simInstance)?.(next)
                        if (prev === 'idle' && next === 'alert') soundManager.playAlertSound()
                        if (prev === 'chase' && next === 'search') soundManager.playLostSound()
                    },
                    onLand: (x, y, z, s) => {
                        soundManager.playLanding(s)
                        dispatchFx(simInstance, { type: 'land', x, y, z, strength: s })
                    },
                    onImpact: (x, y, z, s) => {
                        soundManager.playImpact(s)
                        dispatchFx(simInstance, { type: 'impact', x, y, z, strength: s })
                    }
                }
            })

            setSim(simInstance)
            setStatus({ loaded: true })
        }

        boot().catch(err => {
            if (active) {
                setStatus({
                    loaded: false,
                    error: err instanceof Error ? err.message : String(err)
                })
            }
        })

        return () => {
            active = false
            worldInstance?.destroy()
        }
        // Arena/enemy settings are baked at construction, so a change to any of them
        // rebuilds the world+sim (stable seed keeps the layout coherent across rebuilds).
    }, [heights, physicsPreset, cubeCount, cubeScale, columnCount, columnSize, columnHeight, enemySize, enemyMass])

    if (status.error) {
        return (
            <div className="box3d-error-screen" style={{ color: '#ff8d7a', padding: 24, textAlign: 'center' }}>
                <h2>Failed to boot Box3D physics.</h2>
                <p>{status.error}</p>
            </div>
        )
    }

    if (!sim) {
        return <div className="box3d-beta-loading">Loading Box3D physics simulator...</div>
    }

    return (
        <Canvas camera={{ position: [0, 8, 12], fov: 45 }} shadows={shadowsEnabled} frameloop={frozen ? 'demand' : 'always'}>
            <Box3DPlayableScene sim={sim} keys={keys} heights={heights} />
        </Canvas>
    )
}
