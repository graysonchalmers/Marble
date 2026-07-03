import { useSphere } from '@react-three/cannon'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useState, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGameStore } from '../../store/useGameStore'

const MAX_PARTICLES = 100
const dummy = new THREE.Object3D()

export function PlayerSphere({ positionRef }: { positionRef?: React.MutableRefObject<THREE.Vector3> }) {
    const jumpForce = useGameStore(s => s.jumpForce)
    const moveSpeed = useGameStore(s => s.moveSpeed)
    const isPaused = useGameStore(s => s.isPaused)
    const setIsPaused = useGameStore(s => s.setIsPaused)
    const cameraStiffness = useGameStore(s => s.cameraStiffness)
    const cameraOffset = useGameStore(s => s.cameraOffset)
    const gameState = useGameStore(s => s.gameState)
    const playerAirControl = useGameStore(s => s.playerAirControl)
    const playerTopSpeed = useGameStore(s => s.playerTopSpeed)

    const [ref, api] = useSphere(() => ({
        mass: 1,
        position: [0, 5, 0],
        args: [0.5],
        material: { friction: 0.5, restitution: 0.2 }, // Higher friction (was 0.3), lower restitution (was 0.4) for less bounce
        type: 'Dynamic',
        linearDamping: 0.1, // Added damping to stop infinite rolling
        angularDamping: 0.4
    }))

    const { camera, scene } = useThree()

    // Input state
    const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false, space: false, shift: false })
    const lastInputTime = useRef(Date.now())

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            lastInputTime.current = Date.now()
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
            lastInputTime.current = Date.now()
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

    // Physics state (stored for interpolation)
    const velocity = useRef([0, 0, 0])
    const angularVelocity = useRef([0, 0, 0]) // Track angular velocity for direction change boost
    const physicsPos = useRef([0, 5, 0])
    const physicsQuat = useRef([0, 0, 0, 1])

    useEffect(() => api.velocity.subscribe((v) => (velocity.current = v)), [api.velocity])
    useEffect(() => api.angularVelocity.subscribe((v) => (angularVelocity.current = v)), [api.angularVelocity])
    useEffect(() => api.position.subscribe((p) => {
        physicsPos.current = p
        if (positionRef) {
            positionRef.current.set(p[0], p[1], p[2])
        }
        useGameStore.setState({ playerPosition: { x: p[0], y: p[1], z: p[2] } }) // Report to debug UI
    }), [api.position, positionRef])
    useEffect(() => api.quaternion.subscribe((q) => (physicsQuat.current = q)), [api.quaternion])

    // Visual mesh ref (separate from physics body)
    const visualMeshRef = useRef<THREE.Mesh>(null)

    // Jump state
    const canJump = useRef(true)
    const raycaster = useRef(new THREE.Raycaster())
    const downVector = useRef(new THREE.Vector3(0, -1, 0))
    const isGrounded = useRef(true) // Track grounded state for air control

    // Particle State (Optimized)
    const particlesRef = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; life: number }[]>([])
    const particleMeshRef = useRef<THREE.InstancedMesh>(null)

    const spawnParticles = (position: THREE.Vector3) => {
        for (let i = 0; i < 10; i++) {
            if (particlesRef.current.length < MAX_PARTICLES) {
                particlesRef.current.push({
                    pos: position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5)),
                    vel: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2),
                    life: 1.0 // 1 second life
                })
            }
        }
    }

    // Light refs
    const lightRef = useRef<THREE.DirectionalLight>(null)
    const lightTarget = useRef<THREE.Object3D>(null)

    // Smoothed positions (decoupled from physics updates)
    const smoothedCamTarget = useRef(new THREE.Vector3(0, 5, 0))
    const smoothedBallPos = useRef(new THREE.Vector3(0, 5, 0))
    const smoothedBallQuat = useRef(new THREE.Quaternion())

    // Track last good velocity for hitch recovery
    const lastGoodVelocity = useRef([0, 0, 0])

    // Preallocated vectors to prevent GC during frame updates
    const tempPos = useRef(new THREE.Vector3())
    const tempGroundPos = useRef(new THREE.Vector3())
    const tempOffset = useRef(new THREE.Vector3())
    const tempTargetCamPos = useRef(new THREE.Vector3())
    
    // Optimization: Cache ground objects
    const cachedGround = useRef<THREE.Object3D[]>([])
    const lastCacheUpdate = useRef(0)
    const CACHE_UPDATE_INTERVAL = 2.0

    // Movement Logic
    useFrame((_state, delta) => {
        // PHYSICS HITCH FIX: Clamp delta to prevent instability during frame drops
        // Max 50ms (20 FPS floor) - anything larger indicates a hitch
        const MAX_DELTA = 0.05
        const clampedDelta = Math.min(delta, MAX_DELTA)
        const isHitch = delta > MAX_DELTA

        // Pause Logic
        const timeSinceInput = Date.now() - lastInputTime.current
        if (!isPaused && timeSinceInput > 10000) {
            setIsPaused(true)
        }

        if (isPaused) return

        if (!ref.current) return

        // VELOCITY PRESERVATION: If we detect a hitch, restore last known good velocity
        // This prevents momentum loss from erratic physics during frame drops
        if (isHitch && lastGoodVelocity.current[0] !== 0) {
            api.velocity.set(
                lastGoodVelocity.current[0],
                velocity.current[1], // Keep vertical velocity (gravity)
                lastGoodVelocity.current[2]
            )
        } else if (!isHitch) {
            // Store good velocity when not in a hitch
            lastGoodVelocity.current = [velocity.current[0], velocity.current[1], velocity.current[2]]
        }

        // Freeze controls if not playing
        if (gameState !== 'playing') {
            // Allow settling in setup/countdown but pin X/Z
            if (gameState === 'setup' || gameState === 'countdown') {
                // Keep vertical velocity (falling) but kill horizontal
                api.velocity.set(0, velocity.current[1], 0)
                api.angularVelocity.set(0, 0, 0)
            }
            return
        }

        // Calculate Torque
        const torqueAmount = moveSpeed
        const torque = tempOffset.current.set(0, 0, 0)

        // Only allow movement input if handbrake is not active
        if (!keys.shift) {
            if (keys.w) torque.x -= torqueAmount
            if (keys.s) torque.x += torqueAmount
            if (keys.a) torque.z += torqueAmount
            if (keys.d) torque.z -= torqueAmount
        }

        // Direction change boost: If trying to move against current momentum, boost torque
        // This helps the player "brake" and change direction more easily
        if (torque.lengthSq() > 0) {
            const currentAngVel = new THREE.Vector3(
                angularVelocity.current[0],
                angularVelocity.current[1],
                angularVelocity.current[2]
            )
            const angSpeed = currentAngVel.length()

            // Only apply boost if we have significant angular velocity
            if (angSpeed > 2) {
                // Check if torque direction opposes current angular velocity
                // Dot product: negative means opposing direction
                const alignment = torque.clone().normalize().dot(currentAngVel.clone().normalize())

                if (alignment < -0.3) {
                    // We're trying to reverse! Boost torque significantly
                    // Increased boost from 3->1 to 5->2 for sharper turns
                    const boostFactor = THREE.MathUtils.mapLinear(alignment, -1, -0.3, 5, 2)
                    torque.multiplyScalar(boostFactor)
                }
            }
        }

        // Ground check for air control (run every frame)
        ref.current.getWorldPosition(tempGroundPos.current)
        raycaster.current.set(tempGroundPos.current, downVector.current)
        raycaster.current.far = 1.0

        if (_state.clock.elapsedTime - lastCacheUpdate.current > CACHE_UPDATE_INTERVAL) {
            const ground: THREE.Object3D[] = []
            scene.traverse((obj) => {
                if (obj.userData && obj.userData.isGround) {
                    ground.push(obj)
                }
            })
            cachedGround.current = ground
            lastCacheUpdate.current = _state.clock.elapsedTime
        }

        const intersects = raycaster.current.intersectObjects(cachedGround.current, false)
        isGrounded.current = false
        // Ground Buffer: increased buffer from 0.6 to 1.2 for "sticky" feel
        for (const hit of intersects) {
            if (hit.object.uuid !== ref.current.uuid && hit.distance <= 1.2) {
                isGrounded.current = true
                break
            }
        }

        // Apply air control multiplier when not grounded
        const controlMultiplier = isGrounded.current ? 1.0 : playerAirControl
        torque.multiplyScalar(controlMultiplier)

        // INTERPOLATION FIX: Predict position between physics steps
        const vel = velocity.current
        
        // TOP SPEED CLAMPING 
        const currentSpeed = Math.sqrt(vel[0] * vel[0] + vel[2] * vel[2]) // Horizontal speed only
        
        // Dynamic Damping - Exponentially reduce torque as we approach top speed
        if (currentSpeed > playerTopSpeed * 0.8 && torque.lengthSq() > 0 && !keys.shift) {
            const currentDir = new THREE.Vector3(vel[0], 0, vel[2]).normalize()
            const torqueDir = torque.clone().normalize()
            const torqueAlignment = torqueDir.dot(currentDir)
            
            if (torqueAlignment > 0) {
                const overSpeedPerc = Math.max(0, (currentSpeed - (playerTopSpeed * 0.8)) / (playerTopSpeed * 0.2))
                torque.multiplyScalar(Math.max(0, 1.0 - overSpeedPerc))
            }
        }

        const currentAngVel = new THREE.Vector3(angularVelocity.current[0], angularVelocity.current[1], angularVelocity.current[2])

        // BRAKING LOGIC (Handbrake OR No-Input Coasting)
        if (isGrounded.current && currentAngVel.length() > 0.1) {
            if (keys.shift) {
                const brakeForce = 15.0 // Very strong braking
                torque.x = -currentAngVel.x * brakeForce
                torque.z = -currentAngVel.z * brakeForce
                
                if (currentSpeed > 0.1) {
                    api.applyImpulse([-vel[0] * 0.2, 0, -vel[2] * 0.2], [0, 0, 0])
                }
            } 
            else if (torque.lengthSq() === 0) {
                const brakeForce = 2.0 // Gentle coasting brake
                torque.x = -currentAngVel.x * brakeForce
                torque.z = -currentAngVel.z * brakeForce
            }
        }

        api.applyTorque([torque.x, torque.y, torque.z])

        // Jump Logic
        if (keys.space && canJump.current && isGrounded.current) {
            ref.current.getWorldPosition(tempPos.current)
            api.applyImpulse([0, jumpForce, 0], [0, 0, 0])
            spawnParticles(tempPos.current.clone().add(new THREE.Vector3(0, -0.5, 0)))
            canJump.current = false
            setTimeout(() => { canJump.current = true }, 500)
        }

        // Particle Update
        if (particleMeshRef.current) {
            let activeCount = 0
            let writeIdx = 0
            for (let i = 0; i < particlesRef.current.length; i++) {
                const p = particlesRef.current[i]
                p.life -= delta
                if (p.life > 0) {
                    p.vel.y -= 9.8 * delta
                    p.pos.addScaledVector(p.vel, delta)
                    dummy.position.copy(p.pos)
                    dummy.scale.setScalar(p.life)
                    dummy.updateMatrix()
                    particleMeshRef.current.setMatrixAt(writeIdx, dummy.matrix)
                    particlesRef.current[writeIdx] = p
                    writeIdx++
                    activeCount++
                }
            }
            particlesRef.current.length = activeCount
            particleMeshRef.current.count = activeCount
            particleMeshRef.current.instanceMatrix.needsUpdate = true
        }

        // Camera follow logic
        ref.current.getWorldPosition(tempPos.current)

        // Reset if fell off world
        if (tempPos.current.y < -20) {
            api.position.set(0, 5, 0)
            api.velocity.set(0, 0, 0)
            api.angularVelocity.set(0, 0, 0)
            smoothedCamTarget.current.set(0, 5, 0)
        }

        const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2])

        // Visual Interpolation
        let interpolatedPos = tempPos.current.clone()
        if (speed > 0.5) {
            const predictionFactor = 0.5
            const predictOffset = new THREE.Vector3(
                vel[0] * delta * predictionFactor,
                vel[1] * delta * predictionFactor,
                vel[2] * delta * predictionFactor
            )
            interpolatedPos.add(predictOffset)
        }

        const cameraDelta = Math.min(clampedDelta, 0.033)
        const smoothFactor = 1 - Math.exp(-cameraStiffness * cameraDelta)
        const velocityMagnitude = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2])
        const adaptiveFactor = smoothFactor * (1 + Math.min(velocityMagnitude / 20, 0.5))

        smoothedCamTarget.current.lerp(interpolatedPos, adaptiveFactor * 2)
        tempOffset.current.set(0, cameraOffset * 0.5, cameraOffset)
        tempTargetCamPos.current.copy(smoothedCamTarget.current).add(tempOffset.current)

        camera.position.lerp(tempTargetCamPos.current, adaptiveFactor)
        camera.lookAt(smoothedCamTarget.current)

        // Light follow
        if (lightRef.current && lightTarget.current) {
            lightRef.current.position.set(interpolatedPos.x + 10, interpolatedPos.y + 20, interpolatedPos.z + 5)
            lightTarget.current.position.copy(interpolatedPos)
            lightRef.current.target = lightTarget.current
            lightRef.current.updateMatrixWorld()
            lightTarget.current.updateMatrixWorld()
        }

        // Ball visual lerp - Increased Snappiness
        smoothedBallPos.current.lerp(interpolatedPos, smoothFactor * 6)
        const targetQuat = new THREE.Quaternion(...physicsQuat.current)
        smoothedBallQuat.current.slerp(targetQuat, smoothFactor * 6)

        if (visualMeshRef.current) {
            visualMeshRef.current.position.copy(smoothedBallPos.current)
            visualMeshRef.current.quaternion.copy(smoothedBallQuat.current)
        }
    })

    // Create a simple procedural texture to make rotation visible
    const texture = useMemo(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 256
        canvas.height = 256
        const context = canvas.getContext('2d')
        if (context) {
            context.fillStyle = '#00ffcc'
            context.fillRect(0, 0, 256, 256)

            context.fillStyle = '#0088aa'
            // Draw stripes
            context.fillRect(0, 100, 256, 56)
            context.fillRect(100, 0, 56, 256)

            context.beginPath()
            context.arc(60, 60, 20, 0, Math.PI * 2)
            context.fillStyle = '#ffffff'
            context.fill()
        }
        return new THREE.CanvasTexture(canvas)
    }, [])

    return (
        <>
            {/* Physics body - invisible, only for collision */}
            <mesh ref={ref as any} visible={false}>
                <sphereGeometry args={[0.5, 8, 8]} />
                <meshBasicMaterial />
            </mesh>

            {/* Visual mesh - interpolated for smooth rendering */}
            <mesh ref={visualMeshRef} castShadow userData={{ isPlayer: true }}>
                <sphereGeometry args={[0.5, 32, 32]} />
                <meshStandardMaterial
                    map={texture}
                    color="#ffffff"
                    metalness={0.6}
                    roughness={0.2}
                />
                <pointLight intensity={0.5} distance={5} color="#00ffcc" />
            </mesh>

            {/* Optimized Particles */}
            <instancedMesh ref={particleMeshRef} args={[undefined, undefined, MAX_PARTICLES]}>
                <boxGeometry args={[0.1, 0.1, 0.1]} />
                <meshStandardMaterial color="#ffff00" transparent />
            </instancedMesh>

            <directionalLight
                ref={lightRef}
                intensity={1.5}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-40}
                shadow-camera-right={40}
                shadow-camera-top={40}
                shadow-camera-bottom={-40}
            />
            <object3D ref={lightTarget} />
        </>
    )
}
