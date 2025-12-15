import { useSphere } from '@react-three/cannon'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useState, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useSettings } from './SettingsContext'

const MAX_PARTICLES = 100
const dummy = new THREE.Object3D()

export function PlayerSphere({ positionRef }: { positionRef?: React.MutableRefObject<THREE.Vector3> }) {
    const { jumpForce, moveSpeed, isPaused, setIsPaused, cameraStiffness, cameraOffset, setPlayerPosition, gameState, playerAirControl } = useSettings()

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
    const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false, space: false })
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
        setPlayerPosition({ x: p[0], y: p[1], z: p[2] }) // Report to debug UI
    }), [api.position, positionRef, setPlayerPosition])
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
        const torque = new THREE.Vector3(0, 0, 0)

        if (keys.w) torque.x -= torqueAmount
        if (keys.s) torque.x += torqueAmount
        if (keys.a) torque.z += torqueAmount
        if (keys.d) torque.z -= torqueAmount

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
        const groundCheckPos = new THREE.Vector3()
        ref.current.getWorldPosition(groundCheckPos)
        raycaster.current.set(groundCheckPos, downVector.current)
        raycaster.current.far = 1.0

        const objectsToCheck: THREE.Object3D[] = []
        scene.traverse((obj) => {
            if (obj.userData && obj.userData.isGround) {
                objectsToCheck.push(obj)
            }
        })

        const intersects = raycaster.current.intersectObjects(objectsToCheck, false)
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

        // BRAKING LOGIC
        // If no input, apply counter-torque to stop faster
        if (torque.lengthSq() === 0 && isGrounded.current) {
            const currentAngVel = new THREE.Vector3(angularVelocity.current[0], angularVelocity.current[1], angularVelocity.current[2])
            // Apply opposing torque
            if (currentAngVel.length() > 0.1) {
                const brakeForce = 2.0 // Braking strength
                torque.x = -currentAngVel.x * brakeForce
                torque.z = -currentAngVel.z * brakeForce

                // Allow braking torque to be applied
                // (normally we wouldn't apply if torque is 0, but here we set it)
            }
        }

        api.applyTorque([torque.x, torque.y, torque.z])

        // Jump Logic - now uses already-computed isGrounded.current
        if (keys.space && canJump.current && isGrounded.current) {
            const pos = new THREE.Vector3()
            ref.current.getWorldPosition(pos)

            api.applyImpulse([0, jumpForce, 0], [0, 0, 0])
            spawnParticles(pos.clone().add(new THREE.Vector3(0, -0.5, 0)))

            canJump.current = false
            setTimeout(() => { canJump.current = true }, 500)
        }

        // Particle Update (Imperative)
        if (particleMeshRef.current) {
            let activeCount = 0
            let writeIdx = 0

            for (let i = 0; i < particlesRef.current.length; i++) {
                const p = particlesRef.current[i]
                p.life -= delta
                if (p.life > 0) {
                    // Physics
                    p.vel.y -= 9.8 * delta // Gravity
                    p.pos.addScaledVector(p.vel, delta)

                    // Update Instance
                    dummy.position.copy(p.pos)
                    // Scale down as life fades
                    dummy.scale.setScalar(p.life)
                    dummy.updateMatrix()
                    particleMeshRef.current.setMatrixAt(writeIdx, dummy.matrix)

                    // Keep in array
                    particlesRef.current[writeIdx] = p
                    writeIdx++
                    activeCount++
                }
            }

            // Trim dead particles
            particlesRef.current.length = activeCount

            particleMeshRef.current.count = activeCount
            particleMeshRef.current.instanceMatrix.needsUpdate = true
        }

        // Camera follow logic (frame-rate independent with velocity interpolation)
        const pos = new THREE.Vector3()
        ref.current.getWorldPosition(pos)

        // Reset if fell off world
        if (pos.y < -20) {
            api.position.set(0, 5, 0)
            api.velocity.set(0, 0, 0)
            api.angularVelocity.set(0, 0, 0)
            smoothedCamTarget.current.set(0, 5, 0)
        }

        // INTERPOLATION FIX: Predict position between physics steps
        // At high speeds, physics updates discretely but we render more often
        // Use velocity to predict where ball will be this frame
        const vel = velocity.current
        const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2])

        // Only interpolate at meaningful speeds (avoids jitter at rest)
        let interpolatedPos = pos.clone()
        if (speed > 0.5) {
            // Predict forward by a fraction of the physics timestep
            // This compensates for the render happening between physics ticks
            const predictionFactor = 0.5 // Half a frame ahead
            const predictOffset = new THREE.Vector3(
                vel[0] * delta * predictionFactor,
                vel[1] * delta * predictionFactor,
                vel[2] * delta * predictionFactor
            )
            interpolatedPos.add(predictOffset)
        }

        // Frame-rate independent exponential smoothing
        // Tighter delta clamp for smoother camera at high speeds
        const cameraDelta = Math.min(clampedDelta, 0.033) // Cap at 33ms (30 FPS min)

        // Exponential decay: alpha = 1 - e^(-stiffness * dt)
        const smoothFactor = 1 - Math.exp(-cameraStiffness * cameraDelta)

        // Adaptive smoothing: reduce jitter at high speeds
        const velocityMagnitude = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2])
        const adaptiveFactor = smoothFactor * (1 + Math.min(velocityMagnitude / 20, 0.5))

        // Smooth toward interpolated position (not raw physics position)
        smoothedCamTarget.current.lerp(interpolatedPos, adaptiveFactor * 2)

        // Calculate camera target position from smoothed position
        const offset = new THREE.Vector3(0, cameraOffset * 0.5, cameraOffset)
        const targetCamPos = smoothedCamTarget.current.clone().add(offset)

        // Smooth camera toward target with adaptive factor
        camera.position.lerp(targetCamPos, adaptiveFactor)
        camera.lookAt(smoothedCamTarget.current)

        // Light follow logic
        if (lightRef.current && lightTarget.current) {
            lightRef.current.position.set(interpolatedPos.x + 10, interpolatedPos.y + 20, interpolatedPos.z + 5)
            lightTarget.current.position.copy(interpolatedPos)
            lightRef.current.target = lightTarget.current
            lightRef.current.updateMatrixWorld()
            lightTarget.current.updateMatrixWorld()
        }

        // BALL VISUAL INTERPOLATION
        // Smooth ball position and rotation for render
        smoothedBallPos.current.lerp(interpolatedPos, smoothFactor * 3) // Track faster than camera

        // Smooth quaternion toward physics quaternion
        const targetQuat = new THREE.Quaternion(
            physicsQuat.current[0],
            physicsQuat.current[1],
            physicsQuat.current[2],
            physicsQuat.current[3]
        )
        smoothedBallQuat.current.slerp(targetQuat, smoothFactor * 3)

        // Apply to visual mesh
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
