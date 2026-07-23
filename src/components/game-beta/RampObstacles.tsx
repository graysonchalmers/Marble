/**
 * components/game-beta/RampObstacles.tsx — Phase P Feature E render layer.
 *
 * Draws a 4-sided launch PYRAMID for every cube the sim converted (`sim.rampFlags[i]`). The
 * physics is a cardinal, axis-aligned STEPPED ziggurat of static boxes (see
 * MarbleSim.buildPyramidBoxes — no rotated-collider primitive needed); this visual is a matching
 * smooth square pyramid whose footprint + apex line up with the steps you roll up (visual ≠
 * collider is house style, same as the shipped wedge). The underlying cube instance is hidden in
 * Box3DScene's cube matrix effect (zero-scale) AND excluded from occlusion restore (the `alive`
 * pass), so a converted cube reads as a pyramid, never a cube-with-a-pyramid on top.
 *
 * Symmetric on all four sides → orientation-free (no per-facing geometry). Render-only + static
 * (pyramids never move) → built once per sim, zero per-frame cost.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { MarbleSim } from '../../systems/sim/MarbleSim'
import { OBSTACLES } from '../../systems/sim/tuning'

/**
 * Build a square-base pyramid in LOCAL space: footprint size×size centred on the cube's X/Z with
 * its base at y=0, rising to a single apex at (0, rise, 0). Four triangular side faces + a base
 * quad. Non-indexed (per-triangle verts) so flat normals read as crisp pyramid facets.
 */
function buildPyramidGeometry(size: number, rise: number): THREE.BufferGeometry {
    const h = size / 2
    // Base corners (CCW seen from above) + apex.
    const A: [number, number, number] = [-h, 0, -h]
    const B: [number, number, number] = [h, 0, -h]
    const C: [number, number, number] = [h, 0, h]
    const D: [number, number, number] = [-h, 0, h]
    const T: [number, number, number] = [0, rise, 0]

    const tris: [number, number, number][][] = [
        [A, B, T], [B, C, T], [C, D, T], [D, A, T], // four sloped faces
        [A, D, C], [A, C, B],                        // base (facing down)
    ]
    const positions = new Float32Array(tris.length * 9)
    let o = 0
    for (const [a, b, c] of tris) {
        positions.set(a, o); positions.set(b, o + 3); positions.set(c, o + 6)
        o += 9
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.computeVertexNormals()
    return geo
}

interface RampObstaclesProps {
    sim: MarbleSim
    texture: THREE.Texture
}

export function RampObstacles({ sim, texture }: RampObstaclesProps) {
    // One geometry for all pyramids (symmetric), rebuilt only if the sim (hence dims) changes.
    const geometry = useMemo(
        () => buildPyramidGeometry(sim.rampSize, sim.rampRise),
        [sim],
    )

    const pyramids = useMemo(() => {
        const out: { pos: THREE.Vector3; key: number }[] = []
        // groundTop ≈ terrain contact = cube-center.y − half + sink (matches buildPyramidBoxes).
        const groundOffset = sim.rampSize / 2 - OBSTACLES.sink
        for (let i = 0; i < sim.cubePositions.length; i++) {
            if (!sim.rampFlags[i]) continue
            const c = sim.cubePositions[i]
            out.push({ pos: new THREE.Vector3(c.x, c.y - groundOffset, c.z), key: i })
        }
        return out
    }, [sim])

    if (pyramids.length === 0) return null

    return (
        <group>
            {pyramids.map(({ pos, key }) => (
                <mesh key={key} geometry={geometry} position={pos} castShadow receiveShadow>
                    <meshStandardMaterial map={texture} color="#c9b79a" roughness={0.85} metalness={0.05} side={THREE.DoubleSide} />
                </mesh>
            ))}
        </group>
    )
}
