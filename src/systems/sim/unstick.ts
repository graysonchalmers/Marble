/**
 * systems/sim/unstick.ts — deterministic "un-embed" safety net for the player ball.
 *
 * The velocity movement model overwrites the ball's horizontal velocity every grounded
 * step, which normally feels great but has one failure mode: if the ball ever ends up
 * INSIDE a static obstacle collider (tunneled in at speed, or clipped a cube on landing),
 * the model clobbers the physics solver's push-out every step and the ball is trapped —
 * "stuck inside a cube, can't move at all."
 *
 * This computes an ejection velocity when the ball CENTER is inside an obstacle's collider
 * AABB (cube = uniform half-extent; column = square footprint × height — the collider is a
 * box even though the column renders as a cylinder). Center-inside means genuine penetration,
 * not mere contact, so this only fires to rescue a stuck ball and never during normal play.
 * Pure geometry over sim-owned obstacle data ⇒ deterministic (F9-safe).
 */
export interface Vec3ish { x: number; y: number; z: number }

export interface EjectionParams {
    /** Horizontal ejection speed out the nearest face. */
    ejectSpeed: number
    /** Upward pop added so the ball clears the face lip rather than re-penetrating. */
    ejectUp: number
}

/** Eject out the nearest X/Z face (smallest horizontal penetration) + an upward pop. */
export function ejectVector(dx: number, dz: number, halfX: number, halfZ: number, p: EjectionParams): Vec3ish {
    const penX = halfX - Math.abs(dx) // distance to the nearer ±X face
    const penZ = halfZ - Math.abs(dz) // distance to the nearer ±Z face
    if (penX <= penZ) {
        return { x: (dx >= 0 ? 1 : -1) * p.ejectSpeed, y: p.ejectUp, z: 0 }
    }
    return { x: 0, y: p.ejectUp, z: (dz >= 0 ? 1 : -1) * p.ejectSpeed }
}

/**
 * Ejection velocity if (px,py,pz) is inside any obstacle collider AABB, else null.
 * Cubes are checked first (uniform), then columns (square footprint × height).
 */
export function computeEjection(
    px: number, py: number, pz: number,
    cubes: readonly Vec3ish[], cubeScale: number,
    columns: readonly Vec3ish[], columnSize: number, columnHeight: number,
    p: EjectionParams,
): Vec3ish | null {
    const cubeHalf = cubeScale / 2
    for (let i = 0; i < cubes.length; i++) {
        const c = cubes[i]
        const dx = px - c.x, dy = py - c.y, dz = pz - c.z
        if (Math.abs(dx) < cubeHalf && Math.abs(dy) < cubeHalf && Math.abs(dz) < cubeHalf) {
            return ejectVector(dx, dz, cubeHalf, cubeHalf, p)
        }
    }
    const colHalfXZ = columnSize / 2
    const colHalfY = columnHeight / 2
    for (let i = 0; i < columns.length; i++) {
        const c = columns[i]
        const dx = px - c.x, dy = py - c.y, dz = pz - c.z
        if (Math.abs(dx) < colHalfXZ && Math.abs(dy) < colHalfY && Math.abs(dz) < colHalfXZ) {
            return ejectVector(dx, dz, colHalfXZ, colHalfXZ, p)
        }
    }
    return null
}
