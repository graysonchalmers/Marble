import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useState } from 'react'
import * as THREE from 'three'

import { useSettings } from './SettingsContext'

/**
 * CameraOcclusion - Disables rendering of objects blocking the camera view
 * and replaces them with transparent "ghost" versions.
 */
export function CameraOcclusion({ playerPos }: {
    playerPos: React.MutableRefObject<THREE.Vector3>
}) {
    const { camera, scene } = useThree()
    const { cubeScale } = useSettings()

    // Raycaster
    const raycaster = useRef(new THREE.Raycaster())
    const tempDir = useRef(new THREE.Vector3())
    const zeroMatrix = useRef(new THREE.Matrix4().makeScale(0, 0, 0)) // Hidden state

    // State for rendering ghosts
    interface Ghost {
        position: THREE.Vector3
        quaternion: THREE.Quaternion
        scale: THREE.Vector3
        id: string
    }
    const [ghosts, setGhosts] = useState<Ghost[]>([])

    // Tracking hidden instances: Map<Mesh, Map<InstanceId, OriginalMatrix>>
    const hiddenInstances = useRef(new Map<THREE.InstancedMesh, Map<number, THREE.Matrix4>>())

    // Throttle / Cache
    const lastCheck = useRef(0)
    const CHECK_INTERVAL = 0.05 // 20Hz check
    const cachedOccluders = useRef<THREE.Object3D[]>([])
    const lastCacheTime = useRef(0)
    const CACHE_INTERVAL = 1.0

    useFrame((state) => {
        if (!playerPos.current) return
        const currentTime = state.clock.elapsedTime

        // 1. Cache Occluders
        if (currentTime - lastCacheTime.current > CACHE_INTERVAL) {
            lastCacheTime.current = currentTime
            const occluders: THREE.Object3D[] = []
            scene.traverse((obj) => {
                if (obj.userData && obj.userData.isObstacle) {
                    occluders.push(obj)
                }
            })
            cachedOccluders.current = occluders
        }

        // 2. Raycast Check
        if (currentTime - lastCheck.current < CHECK_INTERVAL) return
        lastCheck.current = currentTime

        tempDir.current.copy(playerPos.current).sub(camera.position)
        const distToPlayer = tempDir.current.length()
        tempDir.current.normalize()

        raycaster.current.set(camera.position, tempDir.current)
        raycaster.current.far = distToPlayer - 1.0 // Stop before player
        raycaster.current.near = 0.5

        const intersects = raycaster.current.intersectObjects(cachedOccluders.current, true)

        // Identify current blocking instances
        const currentBlocking = new Map<THREE.InstancedMesh, Set<number>>()
        const newGhosts: Ghost[] = []

        for (const hit of intersects) {
            if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
                const mesh = hit.object
                const id = hit.instanceId

                if (!currentBlocking.has(mesh)) {
                    currentBlocking.set(mesh, new Set())
                }
                const meshSet = currentBlocking.get(mesh)!

                if (!meshSet.has(id)) {
                    meshSet.add(id)

                    // Prepare Ghost Data
                    const originalMatrix = new THREE.Matrix4()
                    // If already hidden, use cached original matrix
                    if (hiddenInstances.current.has(mesh) && hiddenInstances.current.get(mesh)!.has(id)) {
                        originalMatrix.copy(hiddenInstances.current.get(mesh)!.get(id)!)
                    } else {
                        // Otherwise read from mesh
                        mesh.getMatrixAt(id, originalMatrix)
                    }

                    const pos = new THREE.Vector3()
                    const quat = new THREE.Quaternion()
                    const scl = new THREE.Vector3()
                    originalMatrix.decompose(pos, quat, scl)

                    newGhosts.push({
                        position: pos,
                        quaternion: quat,
                        scale: scl,
                        id: `${mesh.uuid}-${id}`
                    })
                }
            }
            // Limit max occlusion to prevent perf tanking
            if (newGhosts.length >= 5) break
        }

        // 3. Restore NON-blocking instances
        hiddenInstances.current.forEach((idMap, mesh) => {
            const blockingIds = currentBlocking.get(mesh)
            const toRemove: number[] = []

            idMap.forEach((originalMatrix, id) => {
                if (!blockingIds || !blockingIds.has(id)) {
                    // Restore
                    mesh.setMatrixAt(id, originalMatrix)
                    mesh.instanceMatrix.needsUpdate = true
                    toRemove.push(id)
                }
            })

            toRemove.forEach(id => idMap.delete(id))
            if (idMap.size === 0) {
                hiddenInstances.current.delete(mesh)
            }
        })

        // 4. Hide NEW blocking instances
        currentBlocking.forEach((ids, mesh) => {
            if (!hiddenInstances.current.has(mesh)) {
                hiddenInstances.current.set(mesh, new Map())
            }
            const hiddenIds = hiddenInstances.current.get(mesh)!

            ids.forEach(id => {
                if (!hiddenIds.has(id)) {
                    const mat = new THREE.Matrix4()
                    mesh.getMatrixAt(id, mat)
                    hiddenIds.set(id, mat.clone())

                    // HIDE IT
                    mesh.setMatrixAt(id, zeroMatrix.current)
                    mesh.instanceMatrix.needsUpdate = true
                }
            })
        })

        // 5. Update Ghosts State
        // Simple distinct check to avoid unnecessary re-renders
        if (newGhosts.length !== ghosts.length || newGhosts.some((g, i) => g.id !== ghosts[i].id)) {
            setGhosts(newGhosts)
        }
    })

    return (
        <>
            {ghosts.map((ghost) => (
                <group key={ghost.id} position={ghost.position} quaternion={ghost.quaternion} scale={ghost.scale}>
                    {/* Transparent Solid */}
                    <mesh>
                        <boxGeometry args={[cubeScale, cubeScale, cubeScale]} />
                        <meshStandardMaterial
                            color="#808080"
                            transparent
                            opacity={0.2}
                            depthWrite={false}
                        />
                    </mesh>
                    {/* Wireframe Overlay */}
                    <lineSegments>
                        <edgesGeometry args={[new THREE.BoxGeometry(cubeScale, cubeScale, cubeScale)]} />
                        <lineBasicMaterial color="#ffffff" transparent opacity={0.3} />
                    </lineSegments>
                </group>
            ))}
        </>
    )
}
