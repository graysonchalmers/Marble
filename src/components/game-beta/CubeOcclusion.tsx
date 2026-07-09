/**
 * CubeOcclusion.tsx — see-through obstacle cubes (Box3D path).
 *
 * When a cube sits between the camera and the player ball, hide the opaque instance
 * and draw a ~40%-transparent "ghost" of the same cube in its place, so the player is
 * never lost behind an obstacle. Occlusion is computed analytically (segment vs cube
 * AABB in systems/render/occlusion.ts) — no raycaster, no WASM query — against the
 * static cube centers the sim owns.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useState } from 'react'
import * as THREE from 'three'
import { findOccludingCubes } from '../../systems/render/occlusion'

type Props = {
    /** The shared cube InstancedMesh whose blocking instances get hidden. */
    cubesRef: React.MutableRefObject<THREE.InstancedMesh | null>
    /** Static cube centers (sim-authoritative). */
    centers: THREE.Vector3[]
    /** Cube edge length (sim-authoritative). */
    cubeScale: number
    /** Same texture the opaque cubes use, so the ghost reads as the same cube. */
    texture: THREE.Texture
    /** Live player render position (parent updates this each frame). */
    playerPosRef: React.MutableRefObject<THREE.Vector3>
}

export function CubeOcclusion({ cubesRef, centers, cubeScale, texture, playerPosRef }: Props) {
    const { camera } = useThree()
    const half = cubeScale / 2

    const hidden = useRef<Set<number>>(new Set())
    const [ghosts, setGhosts] = useState<number[]>([])
    const clock = useRef(0)
    const CHECK_INTERVAL = 0.05 // 20 Hz is plenty for this

    const tmpMat = useRef(new THREE.Matrix4())
    const zeroMat = useRef(new THREE.Matrix4().makeScale(0, 0, 0))

    useFrame((_, delta) => {
        const mesh = cubesRef.current
        if (!mesh || centers.length === 0) return

        clock.current += delta
        if (clock.current < CHECK_INTERVAL) return
        clock.current = 0

        const occ = findOccludingCubes(camera.position, playerPosRef.current, centers, half)
        const occSet = new Set(occ)
        let changed = false

        // Restore cubes that are no longer blocking.
        hidden.current.forEach(i => {
            if (!occSet.has(i)) {
                const c = centers[i]
                tmpMat.current.makeTranslation(c.x, c.y, c.z)
                mesh.setMatrixAt(i, tmpMat.current)
                hidden.current.delete(i)
                changed = true
            }
        })
        // Hide newly blocking cubes (ghost takes their place).
        occSet.forEach(i => {
            if (!hidden.current.has(i)) {
                mesh.setMatrixAt(i, zeroMat.current)
                hidden.current.add(i)
                changed = true
            }
        })
        if (changed) mesh.instanceMatrix.needsUpdate = true

        // Only re-render the ghost list when the blocking set actually changes.
        if (occ.length !== ghosts.length || occ.some((v, k) => v !== ghosts[k])) {
            setGhosts(occ)
        }
    })

    return (
        <group>
            {ghosts.map(i => (
                <mesh key={i} position={[centers[i].x, centers[i].y, centers[i].z]}>
                    <boxGeometry args={[cubeScale, cubeScale, cubeScale]} />
                    <meshStandardMaterial
                        map={texture}
                        transparent
                        opacity={0.4}
                        depthWrite={false}
                        roughness={0.6}
                    />
                    <lineSegments>
                        <edgesGeometry args={[new THREE.BoxGeometry(cubeScale, cubeScale, cubeScale)]} />
                        <lineBasicMaterial color="#ffffff" transparent opacity={0.25} />
                    </lineSegments>
                </mesh>
            ))}
        </group>
    )
}
