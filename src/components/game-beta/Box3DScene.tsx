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

import { useEffect, useRef, useState, useMemo, type ComponentRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Sky, OrbitControls } from '@react-three/drei'
import { Box3DWorld } from '../../physics/box3d/Box3DWorld'
import { loadBox3DBridge, loadBox3DBridgeModule } from '../../physics/box3d/box3dBridge'
import { useGameStore } from '../../store/useGameStore'
import { soundManager } from '../../audio/SoundManager'
import { GameLoop } from '../../engine/loop'
import { rulesSystem } from '../../systems/rules/RulesSystem'
import { SonarSystem } from '../../systems/sonar/SonarSystem'
import { MarbleSim, type SimInput } from '../../systems/sim/MarbleSim'
import { SIM_RATE_HZ, TERRAIN, PHYSICS_PRESETS, FIXED_DT } from '../../systems/sim/tuning'
import { getStateVisuals, type EnemyState } from '../../systems/ai/EnemyAI'
import { CubeOcclusion } from './CubeOcclusion'
import { ObstacleOcclusion } from './ObstacleOcclusion'
import { Box3DParticles, dispatchFx, REFLECTION_EXCLUDE_LAYER } from './Box3DParticles'
import { Box3DPathTrails } from './Box3DPathTrails'
import { RampObstacles } from './RampObstacles'
import { AIDebugOverlay } from './AIDebugOverlay'
import { ReplayRecorder } from '../../systems/replay/recorder'
import { ReplayPlayer } from '../../systems/replay/player'
import { REPLAY_VERSION, type ReplayHeader } from '../../systems/replay/types'
import { useReplayStore } from '../../state/replayStore'
// Terrain is a single source of truth now (utils/terrain.ts): the collider heightfield, the
// render mesh, obstacle placement, and downhill roll all read getTerrainHeight — and the
// variable-floor roughness (Feature B) rides on top via setTerrainRoughness before we sample.
import { generateTerrainHeights, setTerrainRoughness } from '../../utils/terrain'

// Terrain constants (physics reads these via tuning.ts; visuals share them here)
const WIDTH = TERRAIN.width
const DEPTH = TERRAIN.depth
const SCALE = TERRAIN.scale

// Feature C/D debris tints (the debris pool is one instancedMesh; per-instance instanceColor picks
// which). Crate shards = rust; column bricks = lavender (matches the pillar) so rubble reads as
// "from that thing." Material color is white so instanceColor is the sole tint.
const DEBRIS_COLOR_CRATE = new THREE.Color('#a85a3c')
const DEBRIS_COLOR_COLUMN = new THREE.Color('#b8b0c8')

// Grid texture with a sharp minor/major line hierarchy at 2048px (legacy FallingCubes
// look, v1 Level.tsx): thin faint minor lines + strong thick major lines, anisotropy 16
// so lines stay crisp and don't alias away at distance. Used for BOTH the cubes and the
// ground now (the ground previously used a flatter single-weight 512px texture — "little
// grids, no big lines, some vanish far away"; this unifies them).
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
    /** Stable recorder — captures the live match tick-by-tick. */
    recorder: ReplayRecorder
    /** Present ⇒ this scene is a REPLAY: drive the sim from `player` instead of live input. */
    replay?: { player: ReplayPlayer } | null
}

/** Build the deterministic replay header from the freshly-built sim + current settings. */
function buildReplayHeader(sim: MarbleSim): ReplayHeader {
    const s = useGameStore.getState()
    const physics = PHYSICS_PRESETS[s.physicsPreset] ?? PHYSICS_PRESETS.current
    return {
        version: REPLAY_VERSION,
        seed: sim.seed,
        fixedDt: FIXED_DT,
        enemySize: s.enemySize,
        enemyMass: s.enemyMass,
        gravityY: physics.gravityY,
        physics,
        obstacles: {
            cubeCount: s.cubeCount,
            cubeScale: s.cubeScale,
            columnCount: s.columnCount,
            columnSize: s.columnSize,
            columnHeight: s.columnHeight,
            propCount: s.propCount,
            crumbleCount: s.crumbleCount,
            columnsCrumble: s.columnsCrumble,
            rampCubeRatio: s.rampCubeRatio,
        },
        terrainRoughness: s.terrainRoughness,
        recordedAt: Date.now(),
    }
}

function Box3DPlayableScene({ sim, keys, heights, recorder, replay }: PlayableSceneProps) {
    // Keep the latest replay controller + recorder reachable from the (stably-registered)
    // loop ticks without re-registering them on every render.
    const replayRef = useRef(replay)
    replayRef.current = replay
    const recorderRef = useRef(recorder)
    recorderRef.current = recorder
    const isReplay = !!replay
    const sphereRef = useRef<THREE.Mesh>(null)
    const enemyRef = useRef<THREE.Mesh>(null)
    const cubesRef = useRef<THREE.InstancedMesh>(null)
    const columnsRef = useRef<THREE.InstancedMesh>(null)
    const propsRef = useRef<THREE.InstancedMesh>(null)
    const crumbleRef = useRef<THREE.InstancedMesh>(null)
    const debrisRef = useRef<THREE.InstancedMesh>(null)

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
    const debugAI = useGameStore(s => s.debugAI)
    // Replay camera mode (reactive) — drives whether the free-orbit controls are mounted.
    const replayCamera = useReplayStore(s => s.camera)

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
            // --- REPLAY: re-simulate from the recorded stream (ignores the game-state
            // machine and live keyboard entirely). One recorded frame per fixed step. ---
            const rp = replayRef.current
            if (rp) {
                const frame = rp.player.next()
                if (frame) {
                    sim.step(dt, frame.input, frame.params)
                    useReplayStore.getState().reportPosition(rp.player.position)
                } else {
                    // Reached the end — freeze on the last frame.
                    useReplayStore.getState().setPaused(true)
                }
                return
            }

            // --- LIVE play ---
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
                const releaseParams = { ...params, freezeEnemy: true }
                sim.step(dt, k, releaseParams)
                recorderRef.current.capture(k, releaseParams) // record the head-start frames too
                return
            }
            sim.step(dt, keys.current, params)
            recorderRef.current.capture(keys.current, params)
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

    // Recording lifecycle (LIVE only): start a fresh capture as the match begins,
    // finish it at game over and hand the replay to the replay store. Skipped entirely
    // while this scene is itself a replay.
    useEffect(() => {
        if (isReplay) return
        const rec = recorder
        if (gameState === 'countdown') {
            rec.start(buildReplayHeader(sim))
        } else if (gameState === 'gameover') {
            const finished = rec.stop()
            if (finished) {
                finished.header.finalScore = useGameStore.getState().score
                useReplayStore.getState().setLastReplay(finished)
            }
        } else if (gameState === 'setup') {
            rec.cancel()
        }
    }, [gameState, sim, recorder, isReplay])

    // Render-side smoothing state (camera only — bodies use exact interpolation)
    const smoothedCamTarget = useRef(new THREE.Vector3(0, 6, 0))
    // Free-orbit replay camera: drei OrbitControls instance + a latch so we seed a pleasant
    // starting offset the first frame the user enters free mode (then just follow the player).
    const orbitControlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)
    const freeCamReady = useRef(false)
    const lightRef = useRef<THREE.DirectionalLight>(null)
    const lightTarget = useRef<THREE.Object3D>(null)

    // Scratchpads
    const tempPos = useRef(new THREE.Vector3())
    const tempQuat = useRef(new THREE.Quaternion())
    const tempTargetCamPos = useRef(new THREE.Vector3())
    const tempOffset = useRef(new THREE.Vector3())
    // Scratch for the per-frame prop instance matrices (Feature A).
    const propScale = useRef(new THREE.Vector3())
    const tempMat = useRef(new THREE.Matrix4())
    // Feature C scratch: crumble-block position/scale + debris shard scale.
    const crumblePos = useRef(new THREE.Vector3())
    const crumbleScaleV = useRef(new THREE.Vector3())
    const debrisScaleV = useRef(new THREE.Vector3())
    const identQuat = useRef(new THREE.Quaternion())
    const uiSyncClock = useRef(0)

    // Live interpolated player render position, shared with occlusion + particles.
    const playerRenderPosRef = useRef(new THREE.Vector3())

    // Live interpolated enemy render position, shared with particles (enemy roll trail + ground breadcrumb).
    const enemyRenderPosRef = useRef(new THREE.Vector3())

    // --- Live reflection probe (player ball only) ---
    // A single CubeCamera samples the scene from the ball's position every frame, so the marble
    // reflects the REAL arena (cubes, crumble/debris, columns, props, the enemy, terrain, sky) —
    // not just the static environment map. 256px cube; the ball is hidden during its own pass so it
    // doesn't reflect itself. Particles are on a separate layer the cube camera skips
    // (REFLECTION_EXCLUDE_LAYER) so the additive Points don't make the reflection flicker. The
    // enemy uses the cheap scene env-map (one probe is enough — Grayson's call). Feeds the ball
    // material's envMap below; a MeshPhysicalMaterial clearcoat adds the Fresnel edge sheen.
    const { gl, scene, camera } = useThree()
    const REFLECT_RES = 256
    const reflectRT = useMemo(
        () => new THREE.WebGLCubeRenderTarget(REFLECT_RES, {
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter,
        }),
        []
    )
    const reflectCam = useMemo(() => new THREE.CubeCamera(0.1, 220, reflectRT), [reflectRT])
    useEffect(() => () => { reflectRT.dispose() }, [reflectRT])

    // The main camera must still SEE the particle layer (the cube cameras won't). Enable it once.
    useEffect(() => { camera.layers.enable(REFLECTION_EXCLUDE_LAYER) }, [camera])

    // Sim time-scale shared with the particle system: 1 live, 0 when paused, <1 during replay
    // slow-mo — so trails/bursts freeze on pause and dilate in slow-mo (set each frame below).
    const timeScaleRef = useRef(1)

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

    // Ground now shares the cube grid generator (major/minor hierarchy + anisotropy) so the
    // floor reads with dark thick lines + lighter minor lines like the cubes, instead of the
    // old flat single-weight grid that aliased away at distance.
    const terrainTexture = useCubeGridTexture(groundColorBg, groundColorGrid, groundGridSize)
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
        const scaleZero = new THREE.Vector3(0, 0, 0)
        const identQ = new THREE.Quaternion()
        sim.cubePositions.forEach((pos, i) => {
            // Feature E: ramp cubes are hidden here (zero-scale, like a smashed column) — the wedge
            // is drawn by <RampObstacles>. Plain cubes render normally.
            matrix.compose(pos, sim.cubeQuaternions[i] ?? identQ, sim.rampFlags[i] ? scaleZero : scaleOne)
            mesh.setMatrixAt(i, matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
    }, [sim])

    // Feature E: cubes converted to pyramids are "dead" for occlusion — fed to CubeOcclusion so its
    // per-frame restore() never re-inflates a hidden ramp cube (the "cube on top of the pyramid" bug).
    // Stable reference per sim so it doesn't retrigger the occlusion effects every render.
    const cubeAlive = useMemo(() => sim.rampFlags.map(f => !f), [sim])

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
        // Live pause halts everything; replay ignores the live pause (it's driven by the
        // replay store's own pause/speed instead).
        if (!isReplay && isPaused) return

        const clampedDelta = Math.min(delta, 0.05)

        // Advance the fixed-step loop (runs 0..N sim/rules/sonar ticks). In replay, scale
        // real time by the playback speed (and freeze on pause) so 0.5×–2× just changes how
        // many recorded frames are consumed per second.
        let advanceDelta = clampedDelta
        if (isReplay) {
            const rs = useReplayStore.getState()
            let spd = rs.paused ? 0 : rs.speed
            // Cinematic slow-mo: dilate time over the final ~1.5s (90 frames @60Hz) into the
            // tag, easing playback speed down toward 0.12× at the moment of the tag. Toggleable
            // from the ReplayBar (rs.slowmo); the HUD "TAG IN" countdown uses the same window.
            if (spd > 0 && rs.slowmo && rs.total > 0) {
                const framesLeft = rs.total - rs.position
                const RAMP = 90
                if (framesLeft <= RAMP) {
                    const t = Math.max(0, framesLeft / RAMP) // 1 → 0 across the ramp
                    spd *= 0.12 + 0.88 * t
                }
            }
            advanceDelta = clampedDelta * spd
        }
        // Share the effective time-scale with the particles (0 paused, <1 slow-mo, 1 live).
        timeScaleRef.current = clampedDelta > 0 ? advanceDelta / clampedDelta : 0
        loop.advance(advanceDelta)
        const alpha = loop.alpha

        // --- Exact render interpolation: prev → curr by alpha ---
        if (sphereRef.current) {
            tempPos.current.lerpVectors(sim.playerPrev.position, sim.playerCurr.position, alpha)
            tempQuat.current.slerpQuaternions(sim.playerPrev.quaternion, sim.playerCurr.quaternion, alpha)
            sphereRef.current.position.copy(tempPos.current)
            sphereRef.current.quaternion.copy(tempQuat.current)
            playerRenderPosRef.current.copy(tempPos.current)

            // Live reflection: re-sample the scene from the ball this frame (hidden during its
            // own capture so it doesn't reflect itself). Cheap 128px cube; envMap on the ball
            // material picks it up automatically.
            const ball = sphereRef.current
            reflectCam.position.copy(ball.position)
            const wasVisible = ball.visible
            ball.visible = false
            reflectCam.update(gl, scene)
            ball.visible = wasVisible
        }

        if (enemyRef.current) {
            tempPos.current.lerpVectors(sim.enemyPrev.position, sim.enemyCurr.position, alpha)
            tempQuat.current.slerpQuaternions(sim.enemyPrev.quaternion, sim.enemyCurr.quaternion, alpha)
            enemyRef.current.position.copy(tempPos.current)
            enemyRef.current.quaternion.copy(tempQuat.current)
            enemyRenderPosRef.current.copy(tempPos.current)
        }

        // --- Props: dynamic clutter, interpolated + tumbling (matrices set every frame) ---
        if (propsRef.current && sim.propCount > 0) {
            for (let i = 0; i < sim.propCount; i++) {
                tempPos.current.lerpVectors(sim.propPrev[i].position, sim.propCurr[i].position, alpha)
                tempQuat.current.slerpQuaternions(sim.propPrev[i].quaternion, sim.propCurr[i].quaternion, alpha)
                const r = sim.propRadii[i]
                propScale.current.set(r, r, r)
                tempMat.current.compose(tempPos.current, tempQuat.current, propScale.current)
                propsRef.current.setMatrixAt(i, tempMat.current)
            }
            propsRef.current.instanceMatrix.needsUpdate = true
        }

        // --- Crumble blocks (Feature C): static until smashed, then hidden (debris takes over) ---
        if (crumbleRef.current && sim.crumbleCount > 0) {
            for (let i = 0; i < sim.crumbleCount; i++) {
                if (sim.crumbleAlive[i]) {
                    crumblePos.current.copy(sim.crumblePositions[i])
                    crumbleScaleV.current.set(sim.crumbleScale, sim.crumbleScale, sim.crumbleScale)
                    tempMat.current.compose(crumblePos.current, sim.crumbleQuaternions[i] ?? identQuat.current, crumbleScaleV.current)
                } else {
                    tempMat.current.makeScale(0, 0, 0)
                }
                crumbleRef.current.setMatrixAt(i, tempMat.current)
            }
            crumbleRef.current.instanceMatrix.needsUpdate = true
        }

        // --- Crumble debris (Feature C): dynamic shards, interpolated + tumbling; unused slots hidden ---
        if (debrisRef.current) {
            const nDebris = sim.debrisActiveCount
            for (let i = 0; i < sim.maxLiveDebris; i++) {
                if (i < nDebris) {
                    tempPos.current.lerpVectors(sim.debrisPrev[i].position, sim.debrisCurr[i].position, alpha)
                    tempQuat.current.slerpQuaternions(sim.debrisPrev[i].quaternion, sim.debrisCurr[i].quaternion, alpha)
                    const sc = sim.debrisScales[i]
                    debrisScaleV.current.set(sc.x, sc.y, sc.z)
                    tempMat.current.compose(tempPos.current, tempQuat.current, debrisScaleV.current)
                    // Feature D: tint per source — lavender bricks (columns) vs rust shards (crates).
                    debrisRef.current.setColorAt(i, sim.debrisIsColumn[i] ? DEBRIS_COLOR_COLUMN : DEBRIS_COLOR_CRATE)
                } else {
                    tempMat.current.makeScale(0, 0, 0)
                }
                debrisRef.current.setMatrixAt(i, tempMat.current)
            }
            debrisRef.current.instanceMatrix.needsUpdate = true
            if (debrisRef.current.instanceColor) debrisRef.current.instanceColor.needsUpdate = true
        }

        // --- Camera ---
        const playerRenderPos = sphereRef.current ? sphereRef.current.position : sim.playerCurr.position
        const cameraDelta = Math.min(clampedDelta, 0.033)
        const smoothFactor = 1 - Math.exp(-cameraStiffness * cameraDelta)

        const replayCameraMode = isReplay ? useReplayStore.getState().camera : null
        // Free-orbit-follow is a REPLAY tool only (replay 'free'). Session 25 briefly routed LIVE
        // play through it too, but the orbit target only eased onto the ball (cameraDelta*8 + drei
        // damping), so a fast ball outran it and drifted off-center ("camera disconnected from the
        // player during gameplay", s28). Live play uses the tight chase camera (the else branch);
        // the free orbit stays available while watching a replay.
        const useFreeFollow = isReplay && replayCameraMode === 'free'

        if (useFreeFollow) {
            // OrbitControls.update() re-derives the camera position from target+spherical, so the
            // user's chosen angle/zoom is preserved while the ball never leaves frame. Mounted
            // whenever this branch is active (see JSX), so it never fights the other cameras.
            const oc = orbitControlsRef.current
            if (oc) {
                if (!freeCamReady.current) {
                    // First free-mode frame: seed a pleasant behind/above framing so it doesn't
                    // snap from wherever the previous camera sat.
                    tempOffset.current.set(0, cameraOffset * 0.5, cameraOffset)
                    tempTargetCamPos.current.copy(playerRenderPos).add(tempOffset.current)
                    state.camera.position.copy(tempTargetCamPos.current)
                    oc.target.copy(playerRenderPos)
                    freeCamReady.current = true
                } else {
                    // Follow: ease the orbit target onto the player (keeps user angle/zoom).
                    oc.target.lerp(playerRenderPos, Math.min(1, cameraDelta * 8))
                }
                oc.update()
            }
        } else if (replayCameraMode === 'orbit') {
            freeCamReady.current = false
            // Cinematic orbit: circle the player at a fixed radius/height, always looking at it.
            // Uses the render clock (not sim time) so the orbit keeps gliding even while paused.
            const t = state.clock.elapsedTime
            const radius = Math.max(10, cameraOffset)
            const orbitX = playerRenderPos.x + Math.cos(t * 0.45) * radius
            const orbitZ = playerRenderPos.z + Math.sin(t * 0.45) * radius
            const orbitY = playerRenderPos.y + cameraOffset * 0.55
            tempTargetCamPos.current.set(orbitX, orbitY, orbitZ)
            state.camera.position.lerp(tempTargetCamPos.current, smoothFactor)
            smoothedCamTarget.current.lerp(playerRenderPos, smoothFactor * 2)
            state.camera.lookAt(smoothedCamTarget.current)
        } else {
            freeCamReady.current = false
            // Chase follow (render-side smoothing) — stiffness + distance are live store settings.
            smoothedCamTarget.current.lerp(playerRenderPos, smoothFactor * 2)
            tempOffset.current.set(0, cameraOffset * 0.5, cameraOffset)
            tempTargetCamPos.current.copy(smoothedCamTarget.current).add(tempOffset.current)
            state.camera.position.lerp(tempTargetCamPos.current, smoothFactor)
            state.camera.lookAt(smoothedCamTarget.current)
        }

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
            {/* Free-orbit REPLAY camera (replay 'free' only): user drags to orbit + scroll to zoom,
                target follows the player each frame (see useFrame). NOT mounted during live play —
                live gameplay uses the tight chase camera so the ball never drifts off-center (s28
                fix); replay 'chase'/'orbit' don't mount it either, so it never fights those cameras.
                Panning off so the ball stays centered; zoom clamped to sane bounds. */}
            {(isReplay && replayCamera === 'free') && (
                <OrbitControls
                    ref={orbitControlsRef}
                    makeDefault
                    enablePan={false}
                    enableDamping
                    dampingFactor={0.12}
                    minDistance={4}
                    maxDistance={80}
                    maxPolarAngle={Math.PI * 0.495}
                />
            )}
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
                    // Instances are scattered across the whole arena, but an InstancedMesh's
                    // default bounding sphere is the single-cube geometry at the LOCAL origin —
                    // so Three frustum-culls the entire mesh (all cubes vanish at once) the moment
                    // the camera pans away from origin. Disable culling: the obstacles are always
                    // potentially on-screen. (Occlusion see-through is a separate, wanted effect.)
                    frustumCulled={false}
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
                    // Same fix as the cubes: don't frustum-cull the whole pillar mesh by its
                    // origin-centered default bounding sphere (all columns vanish together on pan).
                    frustumCulled={false}
                >
                    <cylinderGeometry args={[sim.columnSize / 2, sim.columnSize / 2, sim.columnHeight, 20]} />
                    <meshStandardMaterial map={cubeTexture} color="#b8b0c8" />
                </instancedMesh>
            )}

            {/* Scattered props (Feature A): dynamic knock-around clutter. Collider is a sphere
                (the only dynamic primitive), but the visual is a faceted rubble chunk (icosahedron,
                per-instance scaled by the sim's collider radius) so it reads as debris you plow
                through — not a ball pit. Matrices are updated EVERY frame from the sim snapshots
                (props move), and frustum culling is off (same origin-bounding-sphere gotcha the
                cubes/columns hit). The chunk tumbles with the body's real rotation as it's knocked. */}
            {sim.propCount > 0 && (
                <instancedMesh
                    ref={propsRef}
                    args={[undefined, undefined, sim.propCount]}
                    castShadow
                    receiveShadow
                    frustumCulled={false}
                >
                    <icosahedronGeometry args={[1, 0]} />
                    <meshStandardMaterial map={cubeTexture} color="#c9b79c" roughness={0.9} metalness={0.05} />
                </instancedMesh>
            )}

            {/* Crumble blocks (Feature C): solid static "crates" that vanish when smashed (the
                useFrame loop zero-scales a block's instance the moment sim.crumbleAlive[i] flips).
                Unit box geometry — the per-instance matrix carries the physics-authoritative
                crumbleScale + terrain tilt (compose with scale, so zero-scale hiding is clean).
                Rust-red tint so they read as breakable, distinct from the grey cubes. */}
            {sim.crumbleCount > 0 && (
                <instancedMesh
                    ref={crumbleRef}
                    args={[undefined, undefined, sim.crumbleCount]}
                    castShadow
                    receiveShadow
                    frustumCulled={false}
                >
                    <boxGeometry args={[1, 1, 1]} />
                    <meshStandardMaterial map={cubeTexture} color="#b5674a" roughness={0.85} metalness={0.05} />
                </instancedMesh>
            )}

            {/* Crumble debris (Feature C "real" path): a fixed pool of maxLiveDebris instances.
                Collider is a real dynamic BOX (marble_box3d_create_dynamic_box) whose half-extents
                match this shard exactly (sim.debrisScales) — the box you see IS the box that
                collides, tumbling with the body. Live slots filled each frame; the rest zero-scaled. */}
            <instancedMesh
                ref={debrisRef}
                args={[undefined, undefined, sim.maxLiveDebris]}
                castShadow
                receiveShadow
                frustumCulled={false}
            >
                <boxGeometry args={[1, 1, 1]} />
                {/* color=white so the per-instance instanceColor (set each frame) is the sole tint:
                    rust for crate shards, lavender for column bricks (Feature D). */}
                <meshStandardMaterial map={cubeTexture} color="#ffffff" roughness={0.9} metalness={0.05} />
            </instancedMesh>

            {/* Player Sphere Visual Mesh — reflective marble. Keeps its teal pattern (map) but the
                live CubeCamera envMap (reflectRT) makes it mirror the real arena. MeshPhysicalMaterial
                with a clearcoat adds a Fresnel edge sheen: the coating's reflectance rises toward
                grazing angles, so the ball reads MORE reflective around the rim (faces angled away)
                and a touch calmer through the center — the effect Grayson asked for. More reflective
                overall than s23 (higher metalness, lower roughness, envMapIntensity 1.35). To dial:
                clearcoat 0..1 = strength of the rim sheen; roughness/metalness = overall mirror. */}
            <mesh ref={sphereRef} castShadow>
                <sphereGeometry args={[0.5, 32, 16]} />
                <meshPhysicalMaterial
                    map={ballTexture}
                    roughness={0.1}
                    metalness={0.85}
                    envMap={reflectRT.texture}
                    envMapIntensity={1.35}
                    clearcoat={1.0}
                    clearcoatRoughness={0.12}
                />
            </mesh>

            {/* Enemy Sphere Visual Mesh — reflects the cheap scene env-map (sunset preset) only;
                no dedicated probe (back to one probe, Grayson's call). */}
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

            {/* Feature E: launch ramps — stepped-wedge visuals over the ramp cubes (whose cube
                instances are hidden in the matrix effect). Renders nothing when no cube is a ramp. */}
            <RampObstacles sim={sim} texture={cubeTexture} />

            {/* Debug: AI legibility overlay — vision range / LOS / hunt-state / search waypoints /
                avoidance probe. Render-only, mounted only when the dev toggle is on. */}
            {debugAI && (
                <AIDebugOverlay sim={sim} playerPosRef={playerRenderPosRef} enemyPosRef={enemyRenderPosRef} />
            )}

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
                    // Feature E: keep pyramid-converted cubes hidden (no cube on top of the pyramid).
                    alive={cubeAlive}
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
                    // Feature D: when columns are destructible, feed the per-column alive state so a
                    // smashed (parked) pillar vanishes + stops occluding instead of popping back.
                    alive={sim.columnsCrumble ? sim.columnAlive : undefined}
                />
            )}

            {/* Cosmetic particle FX: player + enemy roll trails, impact/landing bursts, enemy ground
                breadcrumb. timeScaleRef syncs them to sim time (freeze on pause, slow-mo ramp). */}
            <Box3DParticles sim={sim} playerPosRef={playerRenderPosRef} enemyPosRef={enemyRenderPosRef} timeScaleRef={timeScaleRef} />

            {/* Path trails: teal (player) + red (enemy) ground lines that slowly fade over ~14s.
                timeScaleRef so the fade freezes on pause + slows with the replay slow-mo. */}
            <Box3DPathTrails sim={sim} playerPosRef={playerRenderPosRef} enemyPosRef={enemyRenderPosRef} timeScaleRef={timeScaleRef} />

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
    // Phase P: prop count is baked at sim construction (rebuild on change, like the obstacles);
    // terrain roughness rebuilds the heights array + collider (see the heights memo below).
    const propCount = useGameStore(s => s.propCount)
    const terrainRoughness = useGameStore(s => s.terrainRoughness)
    const crumbleCount = useGameStore(s => s.crumbleCount)
    const columnsCrumble = useGameStore(s => s.columnsCrumble)
    // Feature E: ramp ratio is baked at sim construction (rebuild on change, like the other obstacles).
    const rampCubeRatio = useGameStore(s => s.rampCubeRatio)

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

    // Replay: when active, the sim is rebuilt from the recorded header (not live settings)
    // and driven by the recorded stream. `epoch` bumps on start/restart to force a rebuild.
    const isReplaying = useReplayStore(s => s.isReplaying)
    const replayEpoch = useReplayStore(s => s.epoch)
    // During replay, rebuild the terrain from the recorded roughness so the collider matches the
    // captured run (old replays without it fall back to the live value). Live play uses the store.
    const replayRoughness = useReplayStore(s => s.lastReplay?.header?.terrainRoughness)
    const effectiveRoughness = isReplaying ? (replayRoughness ?? terrainRoughness) : terrainRoughness
    // Stable recorder for the whole session; the playable scene captures into it live.
    const recorderRef = useRef<ReplayRecorder>(null as unknown as ReplayRecorder)
    if (recorderRef.current === null) recorderRef.current = new ReplayRecorder()
    // The active replay player (rebuilt each boot while replaying), handed to the scene.
    const replayPlayerRef = useRef<{ player: ReplayPlayer } | null>(null)
    // True while boot() is synchronously fast-forwarding the sim to a seek target — mutes sim
    // event side effects (sounds / FX / the tag→gameover transition) during the silent
    // catch-up so scrubbing doesn't machine-gun impacts or fire a bonk on the way there.
    const fastForwardRef = useRef(false)

    // Input captured into a ref — zero React re-renders on keypress.
    const keys = useRef<SimInput>({ w: false, a: false, s: false, d: false, space: false, shift: false })

    // Set the variable-floor roughness BEFORE sampling — generateTerrainHeights → getTerrainHeight
    // reads it, so the collider heightfield + render mesh + sim's analytic terrain all agree.
    const heights = useMemo(() => {
        setTerrainRoughness(effectiveRoughness)
        return generateTerrainHeights()
    }, [effectiveRoughness])

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
        const handleKeyDown = (e: KeyboardEvent) => {
            // Spacebar must ALWAYS jump and must NEVER toggle a focused menu button. Native
            // buttons fire their click on Space, so after clicking DEV TOOLS / a settings
            // button the next Space would collapse the menu instead of jumping. When a button
            // (or non-text control) holds focus, swallow the default activation and blur it so
            // the game keeps control — jump is still registered below regardless. Text inputs
            // are left alone so typing a space still works.
            if (e.key === ' ') {
                const el = document.activeElement as HTMLElement | null
                const tag = el?.tagName
                const isTextEntry = tag === 'INPUT' || tag === 'TEXTAREA' || !!el?.isContentEditable
                if (!isTextEntry) {
                    e.preventDefault()
                    if (el && tag === 'BUTTON') el.blur()
                }
            }
            if (!e.repeat) set(e.key.toLowerCase(), true)
        }
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

            // REPLAY vs LIVE source: when replaying, rebuild the sim EXACTLY from the recorded
            // header (seed / enemy / obstacles / gravity) so it re-simulates the captured run;
            // otherwise build from live settings. Terrain is session-constant either way.
            const replaySt = useReplayStore.getState()
            const header = replaySt.isReplaying ? replaySt.lastReplay?.header ?? null : null

            // Resolve physics feel. Gravity is applied to the world here (set at creation);
            // friction + jump ride into the sim via `physics` below.
            const physics = header
                ? (header.physics ?? PHYSICS_PRESETS.current)
                : (PHYSICS_PRESETS[storeState.physicsPreset] ?? PHYSICS_PRESETS.current)

            worldInstance.reset(header ? header.gravityY : physics.gravityY) // clears smoke scene + sets gravity

            const simInstance = new MarbleSim(worldInstance, {
                heights,
                enemySize: header ? header.enemySize : storeState.enemySize,
                enemyMass: header ? header.enemyMass : storeState.enemyMass,
                physics,
                // Replay: use the recorded seed (bit-identical run). Live: stable per-session
                // seed so a settings rebuild keeps the same layout; sim.seed records it (F9).
                seed: header ? header.seed : (seedRef.current ?? 0),
                ...(header?.playerSpawn ? { playerSpawn: header.playerSpawn } : {}),
                ...(header?.enemySpawn ? { enemySpawn: header.enemySpawn } : {}),
                obstacles: header?.obstacles ?? {
                    cubeCount: storeState.cubeCount,
                    cubeScale: storeState.cubeScale,
                    // Tall pillars (Obst-2) — live-tunable in SettingsMenu → Environment (apply on restart).
                    columnCount: storeState.columnCount,
                    columnSize: storeState.columnSize,
                    columnHeight: storeState.columnHeight,
                    // Scattered dynamic props (Feature A) — knock-around clutter.
                    propCount: storeState.propCount,
                    // Crashable crumble blocks (Feature C) — smash into debris at speed.
                    crumbleCount: storeState.crumbleCount,
                    // Destructible columns (Feature D) — smash pillars into brick debris.
                    columnsCrumble: storeState.columnsCrumble,
                    // Launch ramps (Feature E) — convert a seeded share of cubes into stepped wedges.
                    rampCubeRatio: storeState.rampCubeRatio
                },
                events: {
                    onTag: () => {
                        // Contact: immediate audible feedback. The round does NOT end here — it
                        // ends on onCaught (after the settle beat) so live + replay both show the
                        // enemy actually overlapping the player. See MarbleSim post-tag settle.
                        if (fastForwardRef.current) return
                        const s = useGameStore.getState()
                        if (s.gameState === 'playing') {
                            soundManager.playBonkSound()
                        }
                    },
                    onCaught: () => {
                        // Settle window elapsed -> end the match. Same guards as onTag: muted during
                        // seek fast-forward, and inert during replay (gameState stays 'gameover'
                        // there, so this never re-ends a running replay).
                        if (fastForwardRef.current) return
                        const s = useGameStore.getState()
                        if (s.gameState === 'playing') {
                            s.setGameState('gameover')
                        }
                    },
                    onAIStateChange: (prev, next) => {
                        useGameStore.setState({ enemyAIState: next })
                        simStateListeners.get(simInstance)?.(next)
                        if (fastForwardRef.current) return
                        if (prev === 'idle' && next === 'alert') soundManager.playAlertSound()
                        if (prev === 'chase' && next === 'search') soundManager.playLostSound()
                    },
                    onLand: (x, y, z, s) => {
                        if (fastForwardRef.current) return
                        soundManager.playLanding(s)
                        dispatchFx(simInstance, { type: 'land', x, y, z, strength: s })
                    },
                    onImpact: (x, y, z, s) => {
                        if (fastForwardRef.current) return
                        soundManager.playImpact(s)
                        dispatchFx(simInstance, { type: 'impact', x, y, z, strength: s })
                    }
                }
            })

            // Replay: build a fresh player over the recorded frames, then FAST-FORWARD the sim
            // to the requested seek frame. WASM can't rewind, so seeking = re-simulate from
            // frame 0 up to the target by replaying its recorded inputs (events muted via
            // fastForwardRef during the catch-up). Playback then continues live from there.
            if (header) {
                const player = new ReplayPlayer(replaySt.lastReplay!)
                const target = Math.max(0, Math.min(replaySt.seekFrame, player.frameCount))
                if (target > 0) {
                    fastForwardRef.current = true
                    for (let f = 0; f < target; f++) {
                        const fr = player.next()
                        if (!fr) break
                        simInstance.step(FIXED_DT, fr.input, fr.params)
                    }
                    fastForwardRef.current = false
                }
                useReplayStore.getState().reportPosition(player.position)
                replayPlayerRef.current = { player }
            } else {
                replayPlayerRef.current = null
            }

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
        // isReplaying/replayEpoch also rebuild: entering/leaving replay, or restarting it.
    }, [heights, physicsPreset, cubeCount, cubeScale, columnCount, columnSize, columnHeight, propCount, crumbleCount, columnsCrumble, rampCubeRatio, enemySize, enemyMass, isReplaying, replayEpoch])

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
        <Canvas
            camera={{ position: [0, 8, 12], fov: 45 }}
            shadows={shadowsEnabled}
            // Replay always renders (it drives its own pause via the replay store); otherwise
            // the pause/game-over freeze idles the GPU.
            frameloop={(isReplaying || !frozen) ? 'always' : 'demand'}
        >
            <Box3DPlayableScene
                sim={sim}
                keys={keys}
                heights={heights}
                recorder={recorderRef.current}
                replay={isReplaying ? replayPlayerRef.current : null}
            />
        </Canvas>
    )
}
