/**
 * CubeOcclusion.tsx — see-through obstacle cubes (Box3D path).
 *
 * When a cube sits between the camera and the player ball, hide the opaque instance and
 * draw a "reveal" of the same cube in its place, so the player is never lost behind an
 * obstacle. Occlusion is computed analytically (segment vs cube AABB in
 * systems/render/occlusion.ts) — no raycaster, no WASM query — against the static cube
 * centers the sim owns.
 *
 * Reveal style is player-selectable (`occlusionMode`, Settings → Visuals):
 *   ghost      — 40% transparent textured cube + faint edges (the original).
 *   wireframe  — edges only (bounding-box outline); fully see-through.
 *   xray       — back faces only (front culled): you see through the near face into the
 *                far interior wall, which reads the cube's depth + where you're colliding.
 *   silhouette — dark tinted see-through fill + bright edges (clear shape, still see the ball).
 *   off        — no occlusion; cubes stay solid.
 *
 * Ghost meshes inherit each cube's terrain-tilt quaternion so the reveal matches the
 * (visually tilted) solid instance exactly.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { findOccludingCubes } from '../../systems/render/occlusion'

export type OcclusionMode = 'ghost' | 'wireframe' | 'xray' | 'silhouette' | 'off'

type Props = {
    /** The shared cube InstancedMesh whose blocking instances get hidden. */
    cubesRef: React.MutableRefObject<THREE.InstancedMesh | null>
    /** Static cube centers (sim-authoritative). */
    centers: THREE.Vector3[]
    /** Per-cube terrain-tilt orientation (sim-authoritative), index-aligned with centers. */
    quaternions: THREE.Quaternion[]
    /** Cube edge length (sim-authoritative). */
    cubeScale: number
    /** Same texture the opaque cubes use, so the ghost reads as the same cube. */
    texture: THREE.Texture
    /** Live player render position (parent updates this each frame). */
    playerPosRef: React.MutableRefObject<THREE.Vector3>
    /** Reveal style. */
    mode: OcclusionMode
}

const ONE = new THREE.Vector3(1, 1, 1)

export function CubeOcclusion({ cubesRef, centers, quaternions, cubeScale, texture, playerPosRef, mode }: Props) {
    const { camera } = useThree()
    const half = cubeScale / 2

    const hidden = useRef<Set<number>>(new Set())
    const [ghosts, setGhosts] = useState<number[]>([])
    const clock = useRef(0)
    const CHECK_INTERVAL = 0.05 // 20 Hz is plenty for this

    const tmpMat = useRef(new THREE.Matrix4())
    const zeroMat = useRef(new THREE.Matrix4().makeScale(0, 0, 0))

    // Restore a single instance to its true (tilted) transform.
    const restore = (mesh: THREE.InstancedMesh, i: number) => {
        const c = centers[i]
        const q = quaternions[i] ?? new THREE.Quaternion()
        tmpMat.current.compose(c, q, ONE)
        mesh.setMatrixAt(i, tmpMat.current)
    }

    // When the mode changes (incl. → 'off') or the arena rebuilds, put every hidden
    // instance back so nothing is left invisible under a mode that shouldn't hide it.
    useEffect(() => {
        const mesh = cubesRef.current
        if (mesh) {
            hidden.current.forEach(i => restore(mesh, i))
            mesh.instanceMatrix.needsUpdate = true
        }
        hidden.current.clear()
        setGhosts([])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, centers, quaternions])

    useFrame((_, delta) => {
        const mesh = cubesRef.current
        if (!mesh || centers.length === 0) return

        clock.current += delta
        if (clock.current < CHECK_INTERVAL) return
        clock.current = 0

        // 'off' hides nothing — the mode-change effect already restored everything.
        const occ = mode === 'off'
            ? []
            : findOccludingCubes(camera.position, playerPosRef.current, centers, half)
        const occSet = new Set(occ)
        let changed = false

        // Restore cubes that are no longer blocking.
        hidden.current.forEach(i => {
            if (!occSet.has(i)) {
                restore(mesh, i)
                hidden.current.delete(i)
                changed = true
            }
        })
        // Hide newly blocking cubes (a reveal takes their place).
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

    if (mode === 'off') return null

    return (
        <group>
            {ghosts.map(i => (
                <mesh key={i} position={[centers[i].x, centers[i].y, centers[i].z]} quaternion={quaternions[i] ?? undefined}>
                    <boxGeometry args={[cubeScale, cubeScale, cubeScale]} />
                    {mode === 'ghost' && (
                        <meshStandardMaterial map={texture} transparent opacity={0.4} depthWrite={false} roughness={0.6} />
                    )}
                    {mode === 'xray' && (
                        // Back faces only: the near face is culled so you see straight through
                        // into the far interior wall — reads the cube's depth + your collision.
                        <meshStandardMaterial map={texture} side={THREE.BackSide} transparent opacity={0.55} depthWrite={false} roughness={0.6} />
                    )}
                    {mode === 'silhouette' && (
                        // Flat dark tint, unlit, see-through — a clear shape you can still see the ball through.
                        <meshBasicMaterial color="#0b0b10" transparent opacity={0.34} depthWrite={false} />
                    )}
                    {/* wireframe has no fill — edges only, below */}
                    {(mode === 'ghost' || mode === 'silhouette') && (
                        <lineSegments>
                            <edgesGeometry args={[new THREE.BoxGeometry(cubeScale, cubeScale, cubeScale)]} />
                            <lineBasicMaterial color="#ffffff" transparent opacity={mode === 'silhouette' ? 0.6 : 0.25} />
                        </lineSegments>
                    )}
                    {mode === 'wireframe' && (
                        <lineSegments>
                            <edgesGeometry args={[new THREE.BoxGeometry(cubeScale, cubeScale, cubeScale)]} />
                            <lineBasicMaterial color="#ffffff" transparent opacity={0.9} depthTest={false} />
                        </lineSegments>
                    )}
                </mesh>
            ))}
        </group>
    )
}
