import { useSphere } from '@react-three/cannon'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useEffect, useState, useMemo } from 'react'
import * as THREE from 'three'
// Debug Line removed for performance - emissive color on enemy indicates state
import { useSettings } from './SettingsContext'
import { soundManager } from './SoundManager'
import {
    createAIState,
    updateAIState,
    getSpeedMultiplier,
    getMovementTarget,
    getStateVisuals,
    type EnemyAIState,
    type EnemyState
} from './EnemyAI'

export function EnemySphereV2({ playerPos, positionRef }: {
    playerPos: React.MutableRefObject<THREE.Vector3>,
    positionRef?: React.MutableRefObject<THREE.Vector3>
}) {
    const { enemySpeed, isPaused, gameState, setGameState, setEnemyAIState, setEnemyPosition, enemyAirControl, aiTickRate } = useSettings()
    const { scene } = useThree()

    // Spawn point
    const SPAWN_POS: [number, number, number] = [0, 20, -15]

    const [ref, api] = useSphere(() => ({
        mass: 1.5,
        position: SPAWN_POS,
        args: [0.6],
        material: { friction: 0.8, restitution: 0.1 }, // Higher friction, lower bounce
        type: 'Dynamic',
        linearDamping: 0.8,  // Higher damping for better braking/turning
        angularDamping: 0.7
    }))

    const position = useRef(new THREE.Vector3(...SPAWN_POS))
    const velocity = useRef(new THREE.Vector3())

    useEffect(() => api.position.subscribe((v) => {
        position.current.set(v[0], v[1], v[2])
        if (positionRef) {
            positionRef.current.copy(position.current)
        }
    }), [api.position, positionRef])

    useEffect(() => api.velocity.subscribe((v) => {
        velocity.current.set(v[0], v[1], v[2])
    }), [api.velocity])

    // AI State
    const aiState = useRef<EnemyAIState>(createAIState())
    const [currentState, setCurrentState] = useState<EnemyState>('idle')
    // Use refs instead of state for debug visuals to avoid re-renders
    const lookTargetRef = useRef(new THREE.Vector3())
    const lastKnownVisualRef = useRef<THREE.Vector3 | null>(null)
    const hasLineOfSightRef = useRef(false)

    // Player velocity tracking
    const playerPrevPos = useRef(new THREE.Vector3())
    const playerVel = useRef(new THREE.Vector3())

    // Sonar timing
    const nextPingTime = useRef(0)

    // Raycasters & Caching - REUSE these, never create new ones
    const raycaster = useRef(new THREE.Raycaster())
    const avoidanceRaycaster = useRef(new THREE.Raycaster())
    const groundRaycaster = useRef(new THREE.Raycaster()) // Reuse for ground check
    const downVector = useRef(new THREE.Vector3(0, -1, 0))
    const isGrounded = useRef(true)

    // PREALLOCATED vectors to avoid GC pressure
    const tempVec1 = useRef(new THREE.Vector3())
    const tempVec2 = useRef(new THREE.Vector3())
    const tempVec3 = useRef(new THREE.Vector3())
    const tempVec4 = useRef(new THREE.Vector3())
    const cachedTarget = useRef(new THREE.Vector3())

    // Optimization: Cache obstacles to avoid traversing scene every frame
    const cachedObstacles = useRef<THREE.Object3D[]>([])
    const lastCacheUpdate = useRef(0)
    const CACHE_UPDATE_INTERVAL = 2.0 // Update cache every 2 seconds

    // Optimization: Throttle AI vision updates
    const lastAIUpdate = useRef(0)
    const AI_UPDATE_INTERVAL = 1 / aiTickRate // Configurable via settings

    // Throttle UI state updates even more
    const lastUIUpdate = useRef(0)
    const UI_UPDATE_INTERVAL = 0.25 // Update UI state every 250ms (4Hz)

    // Store latest calculations to use between throttled updates
    const lastCanSee = useRef(false)
    const lastAvoidanceForce = useRef(new THREE.Vector3())

    // Helper to update cache
    const updateObstacleCache = (currentTime: number) => {
        if (currentTime - lastCacheUpdate.current > CACHE_UPDATE_INTERVAL) {
            const obstacles: THREE.Object3D[] = []
            scene.traverse((obj) => {
                if (obj.userData && (obj.userData.isObstacle || obj.userData.isGround)) {
                    obstacles.push(obj)
                }
            })
            cachedObstacles.current = obstacles
            lastCacheUpdate.current = currentTime
        }
    }

    useFrame((state, delta) => {
        // PHYSICS HITCH FIX: Clamp delta to prevent instability during frame drops
        const clampedDelta = Math.min(delta, 0.05) // Max 50ms (20 FPS floor)

        if (isPaused) return
        if (gameState !== 'playing') {
            if (gameState === 'setup' || gameState === 'countdown') {
                api.velocity.set(0, velocity.current.y, 0)
                api.angularVelocity.set(0, 0, 0)
            }
            return
        }
        if (!playerPos.current || !ref.current) return

        const currentTime = state.clock.elapsedTime

        // 0. Update Cache (Low Frequency)
        updateObstacleCache(currentTime)

        // 1. Calculate Player Velocity - REUSE tempVec1 instead of cloning
        // Use clampedDelta to prevent wild velocity estimates during hitches
        tempVec1.current.copy(playerPos.current) // currentPlayerPos
        if (clampedDelta > 0) {
            tempVec2.current.copy(tempVec1.current).sub(playerPrevPos.current) // displacement
            tempVec2.current.divideScalar(clampedDelta) // instantaneousVel
            playerVel.current.lerp(tempVec2.current, 0.1)
        }
        playerPrevPos.current.copy(tempVec1.current)

        // VELOCITY CAP: Prevent "physics defying" launches
        const MAX_VELOCITY = 25
        if (velocity.current.lengthSq() > MAX_VELOCITY * MAX_VELOCITY) {
            api.velocity.set(
                velocity.current.x * 0.95,
                velocity.current.y,
                velocity.current.z * 0.95
            )
        }

        // AI LOGIC THROTTLE
        if (currentTime - lastAIUpdate.current > AI_UPDATE_INTERVAL) {
            lastAIUpdate.current = currentTime

            // 2. LINE OF SIGHT CHECK (Raycasting against Cache) - REUSE tempVec2
            tempVec2.current.copy(tempVec1.current).sub(position.current) // toPlayer
            const distToPlayer = tempVec2.current.length()
            tempVec2.current.normalize() // dirToPlayer

            raycaster.current.set(position.current, tempVec2.current)
            raycaster.current.far = 40

            // Use CACHED obstacles
            const intersects = raycaster.current.intersectObjects(cachedObstacles.current, false)
            const isOccluded = intersects.length > 0 && intersects[0].distance < distToPlayer

            const canSee = distToPlayer < 40 && !isOccluded
            lastCanSee.current = canSee // Store for next frames

            // Update Debug Visuals via ref (no render)
            hasLineOfSightRef.current = canSee

            // 3. Update AI State Machine
            const prevState = aiState.current.state
            const newState = updateAIState(aiState.current, canSee, tempVec1.current, AI_UPDATE_INTERVAL, playerVel.current)

            if (newState !== currentState) {
                setCurrentState(newState)
                setEnemyAIState(newState)

                if (prevState === 'idle' && newState === 'alert') soundManager.playAlertSound()
                if (prevState === 'chase' && newState === 'search') soundManager.playLostSound()
            }

            // Update Last Known Pos Visual via ref (no render)
            if (aiState.current.lastKnownPlayerPos) {
                if (!lastKnownVisualRef.current || lastKnownVisualRef.current.distanceTo(aiState.current.lastKnownPlayerPos) > 0.5) {
                    lastKnownVisualRef.current = aiState.current.lastKnownPlayerPos.clone()
                }
            }

            // OBSTACLE AVOIDANCE CALCULATION (Throttled)
            // Cache the target for use in movement loop
            cachedTarget.current.copy(getMovementTarget(aiState.current, position.current, tempVec1.current, playerVel.current))

            // Avoidance direction calculation - REUSE tempVec3
            tempVec3.current.copy(cachedTarget.current).sub(position.current).normalize() // desiredDir
            tempVec4.current.copy(velocity.current).normalize() // currentVelDir

            // Pick check direction based on velocity
            const checkDir = velocity.current.length() > 1 ? tempVec4.current : tempVec3.current

            avoidanceRaycaster.current.set(position.current, checkDir)
            avoidanceRaycaster.current.far = 3.0

            const avoidIntersects = avoidanceRaycaster.current.intersectObjects(cachedObstacles.current, false)
            lastAvoidanceForce.current.set(0, 0, 0) // Reset

            if (avoidIntersects.length > 0 && avoidIntersects[0].face) {
                // Apply avoidance - rotate check dir and scale
                tempVec2.current.copy(checkDir).applyAxisAngle(downVector.current.clone().negate(), Math.PI / 3)
                lastAvoidanceForce.current.add(tempVec2.current.multiplyScalar(20))
            }

            // Update look target via ref (no render) and UI position throttled
            lookTargetRef.current.copy(cachedTarget.current)
            if (currentTime - lastUIUpdate.current > UI_UPDATE_INTERVAL) {
                lastUIUpdate.current = currentTime
                setEnemyPosition({ x: position.current.x, y: position.current.y, z: position.current.z })
            }
        }

        // 4. Ground Check - REUSE groundRaycaster
        groundRaycaster.current.set(position.current, downVector.current)
        groundRaycaster.current.near = 0
        groundRaycaster.current.far = 1.0
        const groundIntersects = groundRaycaster.current.intersectObjects(cachedObstacles.current, false)
        isGrounded.current = groundIntersects.length > 0 && groundIntersects[0].distance <= 0.8
        const controlMultiplier = isGrounded.current ? 1.0 : enemyAirControl

        // 5. Movement Application (Every Frame) - Use cached target, REUSE tempVec2 for direction
        const speedMultiplier = getSpeedMultiplier(aiState.current.state)

        // Use cached target for smooth movement, only recalculate for player-relative states
        if (aiState.current.state === 'chase' || aiState.current.state === 'alert') {
            // For chase/alert, track current player position smoothly
            tempVec2.current.copy(tempVec1.current).sub(position.current).normalize()
        } else {
            // For other states, use cached target
            tempVec2.current.copy(cachedTarget.current).sub(position.current).normalize()
        }

        // Calculate dot product between velocity and desired direction
        // Negative = moving away from target (overshooting)
        const velMag = velocity.current.length()
        tempVec4.current.copy(velocity.current).normalize()
        const alignment = tempVec4.current.dot(tempVec2.current)

        // Build force vector in tempVec3
        tempVec3.current.copy(tempVec2.current) // desiredDir
        tempVec3.current.add(lastAvoidanceForce.current)

        // Add BRAKING force when overshooting (moving away from target)
        if (alignment < 0.3 && velMag > 2) {
            // Apply counter-force proportional to how wrong the direction is
            const brakingStrength = (1 - alignment) * velMag * 0.5
            tempVec3.current.x -= tempVec4.current.x * brakingStrength
            tempVec3.current.z -= tempVec4.current.z * brakingStrength
        }

        const speed = enemySpeed * speedMultiplier * 15 * controlMultiplier
        api.applyForce([tempVec3.current.x * speed, 0, tempVec3.current.z * speed], [0, 0, 0])

        // 6. Sonar - reuse dist calculation
        const dist = position.current.distanceTo(tempVec1.current)
        if (currentTime > nextPingTime.current) {
            const interval = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(dist, 5, 50, 0.2, 1.5), 0.2, 1.5)
            soundManager.playPing(800 + (50 - dist) * 10)
            nextPingTime.current = currentTime + interval
        }

        // Reset
        if (position.current.y < -20) {
            api.position.set(10, 20, 10)
            api.velocity.set(0, 0, 0)
        }
        if (dist < 1.1) {
            soundManager.playBonkSound()
            setGameState('gameover')
        }
    })

    // Get visual properties
    const visuals = getStateVisuals(currentState)

    const texture = useMemo(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 256; canvas.height = 256; const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.fillStyle = '#ff3333'; ctx.fillRect(0, 0, 256, 256)
            ctx.fillStyle = '#660000'; ctx.fillRect(0, 100, 256, 56); ctx.fillRect(100, 0, 56, 256)
            ctx.beginPath(); ctx.arc(60, 60, 25, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill()
            ctx.strokeStyle = '#990000'; ctx.lineWidth = 8
            for (let i = -256; i < 512; i += 40) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 256, 256); ctx.stroke()
            }
        }
        return new THREE.CanvasTexture(canvas)
    }, [])

    return (
        <>
            <mesh ref={ref as any} castShadow>
                <sphereGeometry args={[0.6, 32, 32]} />
                <meshStandardMaterial
                    map={texture}
                    color="#ffffff"
                    metalness={0.6}
                    roughness={0.3}
                    emissive={visuals.emissive}
                    emissiveIntensity={0.5}
                />
            </mesh>

            {/* Debug visuals removed for performance - enemy emissive color indicates state */}
        </>
    )
}
