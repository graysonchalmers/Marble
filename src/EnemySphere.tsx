import { useSphere } from '@react-three/cannon'
import { useFrame } from '@react-three/fiber'
import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useSettings } from './SettingsContext'

import { soundManager } from './SoundManager'

export function EnemySphere({ playerPos, positionRef }: { playerPos: React.MutableRefObject<THREE.Vector3>, positionRef?: React.MutableRefObject<THREE.Vector3> }) {
    const { enemySpeed, isPaused, gameState, setGameState } = useSettings()

    // Spawn point: High in front of player (assuming -Z is forward)
    const SPAWN_POS: [number, number, number] = [0, 20, -15]

    const [ref, api] = useSphere(() => ({
        mass: 1,
        position: SPAWN_POS,
        args: [0.6],
        material: { friction: 0.1, restitution: 0.5 },
        type: 'Dynamic'
    }))

    const position = useRef(new THREE.Vector3(...SPAWN_POS))
    // Subscribe to position
    useEffect(() => api.position.subscribe((v) => {
        position.current.set(v[0], v[1], v[2])
        if (positionRef) {
            positionRef.current.copy(position.current)
        }
    }), [api.position, positionRef])

    // Sonar Logic
    const nextPingTime = useRef(0)

    // AI State
    const playerPrevPos = useRef(new THREE.Vector3())
    const playerVel = useRef(new THREE.Vector3())

    useFrame((state, delta) => {
        if (isPaused || gameState !== 'playing') return

        if (!playerPos.current || !ref.current) return

        // 1. Calculate Player Velocity
        // v = (current - prev) / dt
        const currentPos = playerPos.current.clone()
        if (delta > 0) {
            const displacement = currentPos.clone().sub(playerPrevPos.current)
            // Smooth velocity a bit?
            const instantaneousVel = displacement.divideScalar(delta)
            playerVel.current.lerp(instantaneousVel, 0.1) // Simple smoothing
        }
        playerPrevPos.current.copy(currentPos)

        const dist = position.current.distanceTo(currentPos)

        // Sonar Ping
        if (state.clock.elapsedTime > nextPingTime.current) {
            const interval = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(dist, 5, 50, 0.2, 1.5), 0.2, 1.5)
            soundManager.playPing(800 + (50 - dist) * 10)
            nextPingTime.current = state.clock.elapsedTime + interval
        }

        // 2. Intercept Logic
        // Time to intercept = Distance / RelativeSpeed (Guessing speed)
        // Let's assume prediction time is proportional to distance, up to a limit.
        const predictionTime = Math.min(dist / 10, 2.0) // Predict up to 2 seconds ahead

        const predictedPlayerPos = currentPos.clone().add(playerVel.current.clone().multiplyScalar(predictionTime))

        // Debug: We could show a marker at predicted pos, but let's keep it invisible.

        const direction = new THREE.Vector3()
            .subVectors(predictedPlayerPos, position.current)
            .normalize()

        // Apply force
        const speed = enemySpeed * 2.5 // Slightly faster than before to be dangerous
        api.applyForce([direction.x * speed, 0, direction.z * speed], [0, 0, 0])

        // Check if fell off
        if (position.current.y < -20) {
            api.position.set(10, 20, 10)
            api.velocity.set(0, 0, 0)
        }

        // Check collision with player
        if (dist < 1.1) {
            setGameState('gameover')
        }
    })

    return (
        <mesh ref={ref as any} castShadow>
            <sphereGeometry args={[0.6, 32, 32]} />
            <meshStandardMaterial
                color="#ff0000"
                metalness={0.8}
                roughness={0.2}
                emissive="#330000"
            />
        </mesh>
    )
}
