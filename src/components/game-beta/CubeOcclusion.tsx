/**
 * CubeOcclusion.tsx — see-through obstacle cubes (Box3D path).
 *
 * Thin wrapper over the shared {@link ObstacleOcclusion} (box shape). The occlusion
 * logic — analytic segment-vs-AABB hide/restore + per-mode reveal — lives in
 * ObstacleOcclusion.tsx and is shared with the column (cylinder) path so cubes and
 * columns behave identically. Kept as a named component so the call site + tests read
 * clearly and the public prop shape stays stable.
 */
import type * as THREE from 'three'
import { ObstacleOcclusion, type OcclusionMode } from './ObstacleOcclusion'

export type { OcclusionMode }

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

export function CubeOcclusion({ cubesRef, centers, quaternions, cubeScale, texture, playerPosRef, mode }: Props) {
    return (
        <ObstacleOcclusion
            meshRef={cubesRef}
            centers={centers}
            quaternions={quaternions}
            shape={{ kind: 'box', size: cubeScale }}
            texture={texture}
            playerPosRef={playerPosRef}
            mode={mode}
        />
    )
}
