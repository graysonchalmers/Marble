import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export function VectorIndicator({ playerPos, enemyPos }: {
    playerPos: React.MutableRefObject<THREE.Vector3>,
    enemyPos: React.MutableRefObject<THREE.Vector3>
}) {
    const groupRef = useRef<THREE.Group>(null)

    useFrame(() => {
        if (!groupRef.current || !playerPos.current || !enemyPos.current) return

        // Position slightly above the player
        groupRef.current.position.copy(playerPos.current).add(new THREE.Vector3(0, 1.5, 0))

        // Look at enemy
        groupRef.current.lookAt(enemyPos.current)
    })

    return (
        <group ref={groupRef}>
            <mesh rotation-x={Math.PI / 2}>
                <coneGeometry args={[0.2, 0.8, 16]} />
                <meshStandardMaterial color="#ff4400" emissive="#ff2200" emissiveIntensity={2} />
            </mesh>
        </group>
    )
}
