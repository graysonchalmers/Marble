import React, { useEffect, useRef, useState, useMemo } from 'react'
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
import {
    createAIState,
    updateAIState,
    getSpeedMultiplier,
    getMovementTarget,
    getStateVisuals,
    type EnemyAIState,
    type EnemyState
} from '../../systems/ai/EnemyAI'

// Terrain constants
const WIDTH = 64
const DEPTH = 64
const SCALE = 2

function generateTerrainData() {
    const data: number[][] = []
    for (let x = 0; x < WIDTH; x++) {
        data.push(new Array(DEPTH).fill(0))
    }
    const visualHeights: number[] = []

    for (let z = 0; z < DEPTH; z++) {
        for (let x = 0; x < WIDTH; x++) {
            const xn = (x / WIDTH) * 5
            const zn = (z / DEPTH) * 5
            const y = Math.sin(xn * 1.5) * Math.cos(zn * 1.5) * 2.5 + Math.sin(xn * 4 + zn * 2) * 0.8
            data[x][z] = y
            visualHeights.push(y)
        }
    }
    return { data, visualHeights }
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

// Logic component that drives the rules engine, sonar system, and sound listener
function Box3DGameLoopDriver({ playerPos, enemyPos }: {
    playerPos: React.MutableRefObject<THREE.Vector3>,
    enemyPos: React.MutableRefObject<THREE.Vector3>
}) {
    const gameState = useGameStore(s => s.gameState)
    const isPaused = useGameStore(s => s.isPaused)

    // Instantiate neutral systems
    const loop = useMemo(() => new GameLoop({ simRate: 60 }), [])
    const sonarSystem = useMemo(() => new SonarSystem(playerPos, enemyPos), [playerPos, enemyPos])

    // Register ticks
    useEffect(() => {
        const tickRules = (dt: number) => rulesSystem.tick(dt)
        const tickSonar = (dt: number) => sonarSystem.tick(dt)

        loop.addTick(tickRules)
        loop.addTick(tickSonar)

        return () => {
            loop.removeTick(tickRules)
            loop.removeTick(tickSonar)
            loop.stop()
        }
    }, [loop, sonarSystem])

    // Manage Sonar audio graphs reactively
    useEffect(() => {
        if (gameState === 'playing' && !isPaused) {
            soundManager.startSonar()
        } else {
            soundManager.stopSonar()
        }
        return () => soundManager.stopSonar()
    }, [gameState, isPaused])

    // Reset systems on restart or setup
    useEffect(() => {
        if (gameState === 'setup' || gameState === 'countdown') {
            loop.reset()
            rulesSystem.reset()
            sonarSystem.reset()
        }
    }, [gameState, loop, sonarSystem])

    useFrame((state, delta) => {
        if (isPaused) return
        const clampedDelta = Math.min(delta, 0.05)
        
        // Advance loop (ticking rules and sonar)
        loop.advance(clampedDelta)

        // Update listener position for spatial audio direction
        if (gameState === 'playing') {
            soundManager.updateListener(state.camera)
        }
    })

    return null
}

type PlayableSceneProps = {
    world: Box3DWorld
    playerBodyPtr: number
    enemyBodyPtr: number
    keys: { w: boolean; a: boolean; s: boolean; d: boolean; space: boolean; shift: boolean }
    visualHeights: number[]
}

function Box3DPlayableScene({ world, playerBodyPtr, enemyBodyPtr, keys, visualHeights }: PlayableSceneProps) {
    const sphereRef = useRef<THREE.Mesh>(null)
    const enemyRef = useRef<THREE.Mesh>(null)
    const canJump = useRef(true)

    // Store settings
    const enemySpeed = useGameStore(s => s.enemySpeed)
    const enemyAirControl = useGameStore(s => s.enemyAirControl)
    const enemySize = useGameStore(s => s.enemySize)
    const setGameState = useGameStore(s => s.setGameState)
    const gameState = useGameStore(s => s.gameState)
    const isPaused = useGameStore(s => s.isPaused)

    // AI State
    const aiState = useRef<EnemyAIState>(createAIState())
    const [currentState, setCurrentState] = useState<EnemyState>('idle')

    // Visual smoothing state
    const smoothedBallPos = useRef(new THREE.Vector3(0, 6, 0))
    const smoothedBallQuat = useRef(new THREE.Quaternion())
    const smoothedEnemyPos = useRef(new THREE.Vector3(0, 20, -15))
    const smoothedEnemyQuat = useRef(new THREE.Quaternion())
    const smoothedCamTarget = useRef(new THREE.Vector3(0, 6, 0))

    const lightRef = useRef<THREE.DirectionalLight>(null)
    const lightTarget = useRef<THREE.Object3D>(null)

    // Scratchpads & tracking
    const tempPos = useRef(new THREE.Vector3())
    const tempVel = useRef(new THREE.Vector3())
    const tempTargetCamPos = useRef(new THREE.Vector3())
    const tempOffset = useRef(new THREE.Vector3())

    const playerPosVec = useRef(new THREE.Vector3())
    const playerVelVec = useRef(new THREE.Vector3())
    const enemyPosVec = useRef(new THREE.Vector3())
    const cachedTarget = useRef(new THREE.Vector3())
    const lastAvoidanceForce = useRef(new THREE.Vector3())

    // Update throttles
    const lastAIUpdate = useRef(0)
    const AI_UPDATE_INTERVAL = 0.1 // 10Hz
    const lastUIUpdate = useRef(0)
    const UI_UPDATE_INTERVAL = 0.033 // 30Hz

    // Procedural terrain mesh
    const geom = useMemo(() => {
        const geometry = new THREE.PlaneGeometry(
            (WIDTH - 1) * SCALE,
            (DEPTH - 1) * SCALE,
            WIDTH - 1,
            DEPTH - 1
        )
        const posAttribute = geometry.attributes.position
        for (let i = 0; i < posAttribute.count; i++) {
            posAttribute.setZ(i, visualHeights[i])
        }
        geometry.computeVertexNormals()
        return geometry
    }, [visualHeights])

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

        // Read player transform & velocity
        const playerTrans = world.readBodyTransform(playerBodyPtr)
        playerPosVec.current.set(playerTrans.position.x, playerTrans.position.y, playerTrans.position.z)
        const playerVel = world.getLinearVelocity(playerBodyPtr)
        playerVelVec.current.set(playerVel.x, playerVel.y, playerVel.z)

        // Handle Setup and Countdown Resets
        if (gameState === 'setup' || gameState === 'countdown') {
            world.bodySetTransform(playerBodyPtr, 0, 6, 0, 0, 0, 0, 1)
            world.setLinearVelocity(playerBodyPtr, 0, 0, 0)
            world.setAngularVelocity(playerBodyPtr, 0, 0, 0)
            smoothedBallPos.current.set(0, 6, 0)

            world.bodySetTransform(enemyBodyPtr, 0, 20, -15, 0, 0, 0, 1)
            world.setLinearVelocity(enemyBodyPtr, 0, 0, 0)
            world.setAngularVelocity(enemyBodyPtr, 0, 0, 0)
            smoothedEnemyPos.current.set(0, 20, -15)

            aiState.current = createAIState()
            if (currentState !== 'idle') {
                setCurrentState('idle')
                useGameStore.setState({ enemyAIState: 'idle' })
            }
            return
        }

        // Read enemy transform & velocity
        const enemyTrans = world.readBodyTransform(enemyBodyPtr)
        enemyPosVec.current.set(enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z)
        const enemyVel = world.getLinearVelocity(enemyBodyPtr)

        // Ground check for player
        const hit = world.raycastClosest(playerTrans.position.x, playerTrans.position.y, playerTrans.position.z, 0, -1.2, 0)
        const isGrounded = hit.hit

        // Player inputs
        const torqueAmount = 18.0
        let tx = (keys.w ? -torqueAmount : 0) + (keys.s ? torqueAmount : 0)
        let tz = (keys.a ? torqueAmount : 0) + (keys.d ? -torqueAmount : 0)

        const airControl = 0.25
        if (!isGrounded) {
            tx *= airControl
            tz *= airControl
        }

        // Player direction change boost
        const playerAngVel = world.getAngularVelocity(playerBodyPtr)
        if (tx !== 0 && playerAngVel.x !== 0 && Math.sign(tx) !== Math.sign(playerAngVel.x)) {
            tx *= 4.5
        }
        if (tz !== 0 && playerAngVel.z !== 0 && Math.sign(tz) !== Math.sign(playerAngVel.z)) {
            tz *= 4.5
        }

        world.applyTorque(playerBodyPtr, tx, 0, tz)

        if (isGrounded) {
            if (keys.shift) {
                world.applyTorque(playerBodyPtr, -playerAngVel.x * 12.0, 0, -playerAngVel.z * 12.0)
                if (Math.sqrt(playerVel.x * playerVel.x + playerVel.z * playerVel.z) > 0.1) {
                    world.applyLinearImpulseToCenter(playerBodyPtr, -playerVel.x * 0.15, 0, -playerVel.z * 0.15)
                }
            } else if (tx === 0 && tz === 0) {
                world.applyTorque(playerBodyPtr, -playerAngVel.x * 2.0, 0, -playerAngVel.z * 2.0)
            }
        }

        const currentSpeed = Math.sqrt(playerVel.x * playerVel.x + playerVel.z * playerVel.z)
        const topSpeed = 22
        if (currentSpeed > topSpeed) {
            const decay = targetDecay(currentSpeed, topSpeed, clampedDelta)
            world.setLinearVelocity(playerBodyPtr, playerVel.x * decay, playerVel.y, playerVel.z * decay)
        }

        if (keys.space && isGrounded && canJump.current) {
            world.applyLinearImpulseToCenter(playerBodyPtr, 0, 7.5, 0)
            canJump.current = false
            setTimeout(() => { canJump.current = true }, 400)
        }

        // --- ENEMY AI LOGIC STEPS (Throttled) ---
        const currentTime = state.clock.elapsedTime
        if (currentTime - lastAIUpdate.current > AI_UPDATE_INTERVAL) {
            lastAIUpdate.current = currentTime

            const dx = playerTrans.position.x - enemyTrans.position.x
            const dy = playerTrans.position.y - enemyTrans.position.y
            const dz = playerTrans.position.z - enemyTrans.position.z
            const distToPlayer = Math.sqrt(dx * dx + dy * dy + dz * dz)

            // 1. Line-of-sight Check (Raycast directly in Box3D world)
            let canSee = false
            if (distToPlayer < 40) {
                const visionHit = world.raycastClosest(
                    enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z,
                    dx, dy, dz
                )
                // Filter out player sphere itself using dynamic fraction based on distance and player radius (0.5)
                const expectedFraction = (distToPlayer - 0.5 - 0.05) / distToPlayer
                canSee = !visionHit.hit || visionHit.fraction >= expectedFraction
            }

            // 2. State machine update
            const prevState = aiState.current.state
            const newState = updateAIState(aiState.current, canSee, playerPosVec.current, AI_UPDATE_INTERVAL, playerVelVec.current)

            if (newState !== currentState) {
                setCurrentState(newState)
                useGameStore.setState({ enemyAIState: newState })

                if (prevState === 'idle' && newState === 'alert') soundManager.playAlertSound()
                if (prevState === 'chase' && newState === 'search') soundManager.playLostSound()
            }

            // 3. Movement Target
            getMovementTarget(aiState.current, enemyPosVec.current, playerPosVec.current, playerVelVec.current, cachedTarget.current)

            // 4. Avoidance Force (Cast forward along velocity/target direction)
            const toTargetX = cachedTarget.current.x - enemyTrans.position.x
            const toTargetZ = cachedTarget.current.z - enemyTrans.position.z
            const toTargetLen = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ)
            const desiredX = toTargetLen > 0.01 ? toTargetX / toTargetLen : 0
            const desiredZ = toTargetLen > 0.01 ? toTargetZ / toTargetLen : 0

            const enemyVelLen = Math.sqrt(enemyVel.x * enemyVel.x + enemyVel.z * enemyVel.z)
            const velDirX = enemyVelLen > 0.01 ? enemyVel.x / enemyVelLen : desiredX
            const velDirZ = enemyVelLen > 0.01 ? enemyVel.z / enemyVelLen : desiredZ

            const checkDirX = enemyVelLen > 1 ? velDirX : desiredX
            const checkDirZ = enemyVelLen > 1 ? velDirZ : desiredZ

            const rayLen = enemySize + 2.4
            const avoidHit = world.raycastClosest(
                enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z,
                checkDirX * rayLen, 0, checkDirZ * rayLen
            )

            lastAvoidanceForce.current.set(0, 0, 0)
            if (avoidHit.hit) {
                // Apply avoidance - rotate checkDir by 60deg CCW
                const angle = Math.PI / 3
                const cosA = Math.cos(angle)
                const sinA = Math.sin(angle)
                const rotX = checkDirX * cosA - checkDirZ * sinA
                const rotZ = checkDirX * sinA + checkDirZ * cosA
                lastAvoidanceForce.current.set(rotX * 20, 0, rotZ * 20)
            }

            // Sync coordinates to Zustand for HUD, Minimap, and Radar updates
            if (currentTime - lastUIUpdate.current > UI_UPDATE_INTERVAL) {
                lastUIUpdate.current = currentTime
                useGameStore.setState({
                    playerPosition: {
                        x: playerTrans.position.x,
                        y: playerTrans.position.y,
                        z: playerTrans.position.z
                    },
                    enemyPosition: {
                        x: enemyTrans.position.x,
                        y: enemyTrans.position.y,
                        z: enemyTrans.position.z
                    }
                })
            }
        }

        // --- ENEMY MOVEMENT APPLICATION (Every Frame) ---
        const groundHit = world.raycastClosest(
            enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z,
            0, -(enemySize + 0.4), 0
        )
        const isEnemyGrounded = groundHit.hit && groundHit.fraction <= ((enemySize + 0.2) / (enemySize + 0.4))
        const enemyControl = isEnemyGrounded ? 1.0 : enemyAirControl

        // Determine heading
        let moveX = playerTrans.position.x - enemyTrans.position.x
        let moveZ = playerTrans.position.z - enemyTrans.position.z
        if (currentState !== 'chase' && currentState !== 'alert') {
            moveX = cachedTarget.current.x - enemyTrans.position.x
            moveZ = cachedTarget.current.z - enemyTrans.position.z
        }

        const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ)
        let headingX = moveLen > 0.01 ? moveX / moveLen : 0
        let headingZ = moveLen > 0.01 ? moveZ / moveLen : 0

        // Accumulate steering and avoidance
        let fx = headingX + lastAvoidanceForce.current.x
        let fz = headingZ + lastAvoidanceForce.current.z

        // Steering braking when overshooting target
        const enemyVelLen = Math.sqrt(enemyVel.x * enemyVel.x + enemyVel.z * enemyVel.z)
        if (enemyVelLen > 2) {
            const velDirX = enemyVel.x / enemyVelLen
            const velDirZ = enemyVel.z / enemyVelLen
            const alignment = velDirX * headingX + velDirZ * headingZ
            if (alignment < 0.3) {
                const brakingStrength = (1 - alignment) * enemyVelLen * 0.5
                fx -= velDirX * brakingStrength
                fz -= velDirZ * brakingStrength
            }
        }

        // Apply dynamic force to enemy center
        const speedMultiplier = getSpeedMultiplier(currentState)
        const forceStrength = enemySpeed * speedMultiplier * 15 * enemyControl
        world.applyForceToCenter(enemyBodyPtr, fx * forceStrength, 0, fz * forceStrength)

        // --- CONTACT TAG TRIGGER ---
        const distToPlayer = enemyPosVec.current.distanceTo(playerPosVec.current)
        if (distToPlayer < (enemySize + 0.5 + 0.1)) {
            soundManager.playBonkSound()
            setGameState('gameover')
        }

        // Resets if fell off boundaries
        if (playerTrans.position.y < -25) {
            world.bodySetTransform(playerBodyPtr, 0, 6, 0, 0, 0, 0, 1)
            world.setLinearVelocity(playerBodyPtr, 0, 0, 0)
            world.setAngularVelocity(playerBodyPtr, 0, 0, 0)
            smoothedBallPos.current.set(0, 6, 0)
        }

        if (enemyTrans.position.y < -25) {
            world.bodySetTransform(enemyBodyPtr, 0, 20, -15, 0, 0, 0, 1)
            world.setLinearVelocity(enemyBodyPtr, 0, 0, 0)
            world.setAngularVelocity(enemyBodyPtr, 0, 0, 0)
            smoothedEnemyPos.current.set(0, 20, -15)
        }

        // Step simulation
        world.step(clampedDelta)

        // Read updated transforms post-step
        const postPlayerTrans = world.readBodyTransform(playerBodyPtr)
        const postPlayerVel = world.getLinearVelocity(playerBodyPtr)

        // Visual interpolation for player
        const playerSpeed = Math.sqrt(postPlayerVel.x * postPlayerVel.x + postPlayerVel.y * postPlayerVel.y + postPlayerVel.z * postPlayerVel.z)
        tempPos.current.set(postPlayerTrans.position.x, postPlayerTrans.position.y, postPlayerTrans.position.z)
        if (playerSpeed > 0.5) {
            tempPos.current.addScaledVector(tempVel.current.set(postPlayerVel.x, postPlayerVel.y, postPlayerVel.z), clampedDelta * 0.5)
        }

        const ballSmooth = 1 - Math.exp(-40 * clampedDelta)
        smoothedBallPos.current.lerp(tempPos.current, ballSmooth)
        
        const playerTargetQuat = new THREE.Quaternion(
            postPlayerTrans.rotation.x,
            postPlayerTrans.rotation.y,
            postPlayerTrans.rotation.z,
            postPlayerTrans.rotation.w
        )
        smoothedBallQuat.current.slerp(playerTargetQuat, ballSmooth)

        if (sphereRef.current) {
            sphereRef.current.position.copy(smoothedBallPos.current)
            sphereRef.current.quaternion.copy(smoothedBallQuat.current)
        }

        // Visual interpolation for enemy
        const postEnemyTrans = world.readBodyTransform(enemyBodyPtr)
        const postEnemyVel = world.getLinearVelocity(enemyBodyPtr)
        const enemySpeedVal = Math.sqrt(postEnemyVel.x * postEnemyVel.x + postEnemyVel.y * postEnemyVel.y + postEnemyVel.z * postEnemyVel.z)
        tempPos.current.set(postEnemyTrans.position.x, postEnemyTrans.position.y, postEnemyTrans.position.z)
        if (enemySpeedVal > 0.5) {
            tempPos.current.addScaledVector(tempVel.current.set(postEnemyVel.x, postEnemyVel.y, postEnemyVel.z), clampedDelta * 0.5)
        }

        const enemySmooth = 1 - Math.exp(-40 * clampedDelta)
        smoothedEnemyPos.current.lerp(tempPos.current, enemySmooth)

        const enemyTargetQuat = new THREE.Quaternion(
            postEnemyTrans.rotation.x,
            postEnemyTrans.rotation.y,
            postEnemyTrans.rotation.z,
            postEnemyTrans.rotation.w
        )
        smoothedEnemyQuat.current.slerp(enemyTargetQuat, enemySmooth)

        if (enemyRef.current) {
            enemyRef.current.position.copy(smoothedEnemyPos.current)
            enemyRef.current.quaternion.copy(smoothedEnemyQuat.current)
        }

        // Camera follow player
        const cameraDelta = Math.min(clampedDelta, 0.033)
        const cameraStiffness = 6.0
        const smoothFactor = 1 - Math.exp(-cameraStiffness * cameraDelta)
        smoothedCamTarget.current.lerp(smoothedBallPos.current, smoothFactor * 2)

        const cameraOffset = 11
        tempOffset.current.set(0, cameraOffset * 0.5, cameraOffset)
        tempTargetCamPos.current.copy(smoothedCamTarget.current).add(tempOffset.current)

        state.camera.position.lerp(tempTargetCamPos.current, smoothFactor)
        state.camera.lookAt(smoothedCamTarget.current)

        // Light follow
        if (lightRef.current && lightTarget.current) {
            lightRef.current.position.set(
                smoothedBallPos.current.x + 17.5,
                smoothedBallPos.current.y + 28.0,
                smoothedBallPos.current.z + 14.0
            )
            lightTarget.current.position.copy(smoothedBallPos.current)
            lightRef.current.target = lightTarget.current
            lightRef.current.updateMatrixWorld()
            lightTarget.current.updateMatrixWorld()
        }
    })

    function targetDecay(current: number, target: number, dt: number) {
        const excess = current - target
        const nextSpeed = target + excess * Math.exp(-15 * dt)
        return nextSpeed / current
    }

    const enemyVisuals = getStateVisuals(currentState)

    return (
        <>
            <Box3DGameLoopDriver playerPos={playerPosVec} enemyPos={enemyPosVec} />

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

export function Box3DScene() {
    const [status, setStatus] = useState<{
        loaded: boolean
        error?: string
    }>({
        loaded: false
    })

    const [world, setWorld] = useState<Box3DWorld | null>(null)
    const [playerBodyPtr, setPlayerBodyPtr] = useState<number>(0)
    const [enemyBodyPtr, setEnemyBodyPtr] = useState<number>(0)
    const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false, space: false, shift: false })

    const { visualHeights } = useMemo(() => generateTerrainData(), [])

    // Setup input listeners
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.repeat) return
            switch (e.key.toLowerCase()) {
                case 'w': case 'arrowup': setKeys(k => ({ ...k, w: true })); break;
                case 's': case 'arrowdown': setKeys(k => ({ ...k, s: true })); break;
                case 'a': case 'arrowleft': setKeys(k => ({ ...k, a: true })); break;
                case 'd': case 'arrowright': setKeys(k => ({ ...k, d: true })); break;
                case ' ': setKeys(k => ({ ...k, space: true })); break;
                case 'shift': setKeys(k => ({ ...k, shift: true })); break;
            }
        }
        const handleKeyUp = (e: KeyboardEvent) => {
            switch (e.key.toLowerCase()) {
                case 'w': case 'arrowup': setKeys(k => ({ ...k, w: false })); break;
                case 's': case 'arrowdown': setKeys(k => ({ ...k, s: false })); break;
                case 'a': case 'arrowleft': setKeys(k => ({ ...k, a: false })); break;
                case 'd': case 'arrowright': setKeys(k => ({ ...k, d: false })); break;
                case ' ': setKeys(k => ({ ...k, space: false })); break;
                case 'shift': setKeys(k => ({ ...k, shift: false })); break;
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [])

    // Load WebAssembly physics
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

            // 1. Create Terrain Heightfield in Box3D
            const flatHeights = new Float32Array(visualHeights)
            const minHeight = -10.0
            const maxHeight = 10.0
            const friction = 0.5
            const restitution = 0.1

            const hfPtr = worldInstance.createHeightfield(
                flatHeights,
                WIDTH,
                DEPTH,
                SCALE,
                1.0,
                SCALE,
                minHeight,
                maxHeight,
                friction,
                restitution
            )

            // Position heightfield body to align with visual mesh centered at (0, 0, 0)
            const hfBodyOffset = -((WIDTH - 1) * SCALE) / 2
            worldInstance.bodySetTransform(hfPtr, hfBodyOffset, 0, hfBodyOffset, 0, 0, 0, 1)

            // 2. Create Static Outer boundary walls
            const halfWidth = (WIDTH * SCALE) / 2
            const halfDepth = (DEPTH * SCALE) / 2
            const wallHeight = 50
            const thickness = 5
            
            // Left Wall
            worldInstance.createStaticBox(-halfWidth, wallHeight / 2 - 10, 0, thickness / 2, wallHeight / 2, halfDepth, 0.5, 0.1)
            // Right Wall
            worldInstance.createStaticBox(halfWidth, wallHeight / 2 - 10, 0, thickness / 2, wallHeight / 2, halfDepth, 0.5, 0.1)
            // Back Wall
            worldInstance.createStaticBox(0, wallHeight / 2 - 10, -halfDepth, halfWidth, wallHeight / 2, thickness / 2, 0.5, 0.1)
            // Front Wall
            worldInstance.createStaticBox(0, wallHeight / 2 - 10, halfDepth, halfWidth, wallHeight / 2, thickness / 2, 0.5, 0.1)

            // Get store settings for dynamic allocations
            const enemySize = useGameStore.getState().enemySize
            const enemyMass = useGameStore.getState().enemyMass

            // 3. Create Player Sphere body
            const playerBody = worldInstance.createDynamicSphere(0, 6, 0, 0.5, 1.0, 0.6, 0.2)
            worldInstance.setDamping(playerBody, 0.1, 0.4)

            // 4. Create Enemy Sphere body
            const enemyBody = worldInstance.createDynamicSphere(0, 20, -15, enemySize, enemyMass, 0.8, 0.1)
            worldInstance.setDamping(enemyBody, 0.8, 0.3)

            setWorld(worldInstance)
            setPlayerBodyPtr(playerBody)
            setEnemyBodyPtr(enemyBody)

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
    }, [visualHeights])

    if (status.error) {
        return (
            <div className="box3d-error-screen" style={{ color: '#ff8d7a', padding: 24, textAlign: 'center' }}>
                <h2>Failed to boot Box3D physics.</h2>
                <p>{status.error}</p>
            </div>
        )
    }

    if (!world || !playerBodyPtr || !enemyBodyPtr) {
        return <div className="box3d-beta-loading">Loading Box3D physics simulator...</div>
    }

    return (
        <Canvas camera={{ position: [0, 8, 12], fov: 45 }} shadows>
            <Box3DPlayableScene
                world={world}
                playerBodyPtr={playerBodyPtr}
                enemyBodyPtr={enemyBodyPtr}
                keys={keys}
                visualHeights={visualHeights}
            />
        </Canvas>
    )
}
