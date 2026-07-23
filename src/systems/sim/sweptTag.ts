/**
 * Swept closest-approach distance for tag detection.
 *
 * The tag check samples ball positions once per fixed step. At high relative speed
 * two balls can pass through their overlap zone *between* samples — step N sees them
 * apart, step N+1 sees them already past each other — so a discrete endpoint check
 * misses the graze ("felt like a tag but didn't register").
 *
 * This returns the minimum distance between two points each moving linearly over the
 * step: player a0→a1 and enemy b0→b1. Feeding that (instead of the endpoint distance)
 * into the tag threshold catches fast grazes without any velocity-dependent tuning.
 *
 * Pure + allocation-free + deterministic (scalar math only) → F9-safe.
 */
export function sweptMinDistance(
    a0x: number, a0y: number, a0z: number,
    a1x: number, a1y: number, a1z: number,
    b0x: number, b0y: number, b0z: number,
    b1x: number, b1y: number, b1z: number,
): number {
    // Relative position of player w.r.t. enemy at the step's start (r0) and end (r1).
    const r0x = a0x - b0x, r0y = a0y - b0y, r0z = a0z - b0z
    const r1x = a1x - b1x, r1y = a1y - b1y, r1z = a1z - b1z
    // Relative displacement over the step.
    const dx = r1x - r0x, dy = r1y - r0y, dz = r1z - r0z
    const dd = dx * dx + dy * dy + dz * dz
    // Param s∈[0,1] minimising |r0 + s·d|; s=0 when there's no relative motion.
    let s = 0
    if (dd > 1e-12) {
        s = -(r0x * dx + r0y * dy + r0z * dz) / dd
        s = s < 0 ? 0 : s > 1 ? 1 : s
    }
    const cx = r0x + s * dx, cy = r0y + s * dy, cz = r0z + s * dz
    return Math.sqrt(cx * cx + cy * cy + cz * cz)
}
