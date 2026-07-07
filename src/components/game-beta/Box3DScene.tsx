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
import { SIM_RATE_HZ, TERRAIN } from '../../systems/sim/tuning'
import { getStateVisuals, type EnemyState } from '../../systems/ai/EnemyAI'

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

type PlayableSceneProps = {
    sim: MarbleSim
    keys: React.MutableRefObject<SimInput>
    heights: Float32Array
}

function Box3DPlayableScene({ sim, keys, heights }: PlayableSceneProps) {
    const sphereRef = useRef<THREE.Mesh>(null)
    const enemyRef = useRef<THREE.Mesh>(null)

    // Store settings/state
    const enemySize = useGameStore(s => s.enemySize)
    const gameState = useGameStore(s => s.gameState)
    const isPaused = useGameStore(s => s.isPaused)

    const [currentState, setCurrentState] = useState<EnemyState>('idle')

    // --- The single fixed-timestep loop: sim → rules → sonar ---
    const loop = useMemo(() => new GameLoop({ simRate: SIM_RATE_HZ }), [])
    const sonarSystem = useMemo(() => new SonarSystem(sim.playerPosRef, sim.enemyPosRef), [sim])

    // Register ticks once. Tick fns read the store imperatively so the loop
    // never needs re-registration on state changes.
    useEffect(() => {
        const tickSim = (dt: number) => {
            const s = useGameStore.getState()
            if (s.gameState === 'setup' || s.gameState === 'countdown') {
                sim.resetPositions()
                return
            }
            sim.step(dt, keys.current, {
                enemySpeed: s.enemySpeed,
                enemyAirControl: s.enemyAirControl
            })
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
        } else {
            soundManager.stopSonar()
        }
        return () => soundManager.stopSonar()
    }, [gameState, isPaused])

    // Reset loop + systems on restart/setup
    useEffect(() => {
        if (gameState === 'setup' || gameState === 'countdown') {
            loop.reset()
            rulesSystem.reset()
            sonarSystem.reset()
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

    const terrainTexture = useGridTexture('#1a4d2e', '#4f772d', 64)
    terrainTexture.repeat.set(WIDTH / 4, DEPTH / 4)

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
        }

        if (enemyRef.current) {
            tempPos.current.lerpVectors(sim.enemyPrev.position, sim.enemyCurr.position, alpha)
            tempQuat.current.slerpQuaternions(sim.enemyPrev.quaternion, sim.enemyCurr.quaternion, alpha)
            enemyRef.current.position.copy(tempPos.current)
            enemyRef.current.quaternion.copy(tempQuat.current)
        }

        // --- Camera follow (render-side smoothing) ---
        const playerRenderPos = sphereRef.current ? sphereRef.current.position : sim.playerCurr.position
        const cameraDelta = Math.min(clampedDelta, 0.033)
        const cameraStiffness = 6.0
        const smoothFactor = 1 - Math.exp(-cameraStiffness * cameraDelta)
        smoothedCamTarget.current.lerp(playerRenderPos, smoothFactor * 2)

        const cameraOffset = 11
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

        // --- Audio listener + throttled store position sync (30Hz) ---
        if (gameState === 'playing') {
            soundManager.updateListener(state.camera)
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
            worldInstance.reset() // Clears default smoke scene

            const storeState = useGameStore.getState()

            const simInstance = new MarbleSim(worldInstance, {
                heights,
                enemySize: storeState.enemySize,
                enemyMass: storeState.enemyMass,
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
    }, [heights])

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
        <Canvas camera={{ position: [0, 8, 12], fov: 45 }} shadows>
            <Box3DPlayableScene sim={sim} keys={keys} heights={heights} />
        </Canvas>
    )
}
