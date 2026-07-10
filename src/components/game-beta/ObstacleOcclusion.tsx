/**
 * ObstacleOcclusion.tsx — see-through static obstacles (Box3D path).
 *
 * When an obstacle sits between the camera and the player ball, hide the opaque
 * instance and draw a "reveal" of the same shape in its place, so the player is never
 * lost behind an obstacle. Occlusion is computed analytically (segment vs AABB in
 * systems/render/occlusion.ts) — no raycaster, no WASM query — against the static
 * obstacle centers the sim owns.
 *
 * Works for BOTH obstacle shapes via the `shape` prop:
 *   box      — cubes (uniform AABB, box reveal).
 *   cylinder — columns / tall pillars (wide × tall × wide AABB, cylinder reveal). The
 *              physics collider is a square-footprint box, so the AABB detection is
 *              collider-accurate; the reveal draws the cylinder to match the visual.
 *
 * Reveal style is player-selectable (`occlusionMode`, Settings → Visuals):
 *   ghost      — 40% transparent textured shape + faint edges (the original).
 *   wireframe  — edges only; fully see-through.
 *   xray       — back faces only (front culled): see through the near face into the far
 *                interior wall, which reads the obstacle's depth + where you're colliding.
 *   silhouette — dark tinted see-through fill + bright edges (clear shape, still see the ball).
 *   off        — no occlusion; obstacles stay solid.
 *
 * Reveal meshes inherit each obstacle's terrain-tilt quaternion so they match the
 * (visually tilted) solid instance exactly.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { findOccludingBoxes } from '../../systems/render/occlusion'

export type OcclusionMode = 'ghost' | 'wireframe' | 'xray' | 'silhouette' | 'off'

/** Box (cube) obstacle: uniform edge length. */
export type BoxShape = { kind: 'box'; size: number }
/** Cylinder (column) obstacle: round footprint, tall. */
export type CylinderShape = { kind: 'cylinder'; radius: number; height: number }
export type ObstacleShape = BoxShape | CylinderShape

type Props = {
    /** The shared obstacle InstancedMesh whose blocking instances get hidden. */
    meshRef: React.MutableRefObject<THREE.InstancedMesh | null>
    /** Static obstacle centers (sim-authoritative). */
    centers: THREE.Vector3[]
    /** Per-obstacle terrain-tilt orientation (sim-authoritative), index-aligned with centers. */
    quaternions: THREE.Quaternion[]
    /** Physical shape + dimensions (sim-authoritative). */
    shape: ObstacleShape
    /** Same texture the opaque obstacles use, so the reveal reads as the same obstacle. */
    texture: THREE.Texture
    /** Live player render position (parent updates this each frame). */
    playerPosRef: React.MutableRefObject<THREE.Vector3>
    /** Reveal style. */
    mode: OcclusionMode
    /** Optional tint for the reveal fill (columns are lavender-tinted like the solid mesh). */
    color?: string
}

const ONE = new THREE.Vector3(1, 1, 1)

// Occlusion aggressiveness — deliberately conservative so the see-through effect
// only fades the few obstacles right around the ball, never a whole corridor.
// The chase camera (cameraStiffness ~6) lags behind a fast ball, stretching the
// cam→player sightline across the arena; without these caps every obstacle along
// that long line faded at once ("all the shapes get occluded when I start moving").
const OCCLUDE_MAX_COUNT = 4      // at most this many obstacles fade at once (was 8)
const OCCLUDE_END_PAD = 0.6      // obstacles the ball rests against don't strobe (default)
const OCCLUDE_PLAYER_RADIUS = 16 // only fade obstacles within 16u (xz) of the ball

/** Half-extents of the shape's axis-aligned bounding box (before tilt). */
function halfExtents(shape: ObstacleShape): [number, number, number] {
    if (shape.kind === 'box') {
        const h = shape.size / 2
        return [h, h, h]
    }
    // Cylinder: radius on X/Z, half-height on Y.
    return [shape.radius, shape.height / 2, shape.radius]
}

/** A fresh base geometry matching the obstacle shape — used for the reveal mesh and its edges. */
function makeGeometry(shape: ObstacleShape): THREE.BufferGeometry {
    return shape.kind === 'box'
        ? new THREE.BoxGeometry(shape.size, shape.size, shape.size)
        : new THREE.CylinderGeometry(shape.radius, shape.radius, shape.height, 20)
}

export function ObstacleOcclusion({ meshRef, centers, quaternions, shape, texture, playerPosRef, mode, color }: Props) {
    const { camera } = useThree()
    const [hx, hy, hz] = halfExtents(shape)

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
        const mesh = meshRef.current
        if (mesh) {
            hidden.current.forEach(i => restore(mesh, i))
            mesh.instanceMatrix.needsUpdate = true
        }
        hidden.current.clear()
        setGhosts([])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, centers, quaternions])

    useFrame((_, delta) => {
        const mesh = meshRef.current
        if (!mesh || centers.length === 0) return

        clock.current += delta
        if (clock.current < CHECK_INTERVAL) return
        clock.current = 0

        // 'off' hides nothing — the mode-change effect already restored everything.
        const occ = mode === 'off'
            ? []
            : findOccludingBoxes(
                camera.position, playerPosRef.current, centers, hx, hy, hz,
                OCCLUDE_MAX_COUNT, OCCLUDE_END_PAD, OCCLUDE_PLAYER_RADIUS,
            )
        const occSet = new Set(occ)
        let changed = false

        // Restore obstacles that are no longer blocking.
        hidden.current.forEach(i => {
            if (!occSet.has(i)) {
                restore(mesh, i)
                hidden.current.delete(i)
                changed = true
            }
        })
        // Hide newly blocking obstacles (a reveal takes their place).
        occSet.forEach(i => {
            if (!hidden.current.has(i)) {
                mesh.setMatrixAt(i, zeroMat.current)
                hidden.current.add(i)
                changed = true
            }
        })
        if (changed) mesh.instanceMatrix.needsUpdate = true

        // Only re-render the reveal list when the blocking set actually changes.
        if (occ.length !== ghosts.length || occ.some((v, k) => v !== ghosts[k])) {
            setGhosts(occ)
        }
    })

    if (mode === 'off') return null

    return (
        <group>
            {ghosts.map(i => (
                <mesh key={i} position={[centers[i].x, centers[i].y, centers[i].z]} quaternion={quaternions[i] ?? undefined}>
                    {shape.kind === 'box'
                        ? <boxGeometry args={[shape.size, shape.size, shape.size]} />
                        : <cylinderGeometry args={[shape.radius, shape.radius, shape.height, 20]} />}
                    {mode === 'ghost' && (
                        <meshStandardMaterial map={texture} color={color} transparent opacity={0.4} depthWrite={false} roughness={0.6} />
                    )}
                    {mode === 'xray' && (
                        // Back faces only: the near face is culled so you see straight through
                        // into the far interior wall — reads the obstacle's depth + your collision.
                        <meshStandardMaterial map={texture} color={color} side={THREE.BackSide} transparent opacity={0.55} depthWrite={false} roughness={0.6} />
                    )}
                    {mode === 'silhouette' && (
                        // Flat dark tint, unlit, see-through — a clear shape you can still see the ball through.
                        <meshBasicMaterial color="#0b0b10" transparent opacity={0.34} depthWrite={false} />
                    )}
                    {/* wireframe has no fill — edges only, below */}
                    {(mode === 'ghost' || mode === 'silhouette') && (
                        <lineSegments>
                            <edgesGeometry args={[makeGeometry(shape)]} />
                            <lineBasicMaterial color="#ffffff" transparent opacity={mode === 'silhouette' ? 0.6 : 0.25} />
                        </lineSegments>
                    )}
                    {mode === 'wireframe' && (
                        <lineSegments>
                            <edgesGeometry args={[makeGeometry(shape)]} />
                            <lineBasicMaterial color="#ffffff" transparent opacity={0.9} depthTest={false} />
                        </lineSegments>
                    )}
                </mesh>
            ))}
        </group>
    )
}
