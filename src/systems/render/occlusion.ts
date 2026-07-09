/**
 * systems/render/occlusion.ts — analytic camera→player occlusion.
 *
 * Pure geometry (no THREE, no scene graph, no raycaster): given the camera and
 * player positions and the static cube centers, return which cubes the sightline
 * passes through. Deterministic and cheap (one segment-vs-AABB test per cube), so
 * it's unit-testable and doesn't depend on WASM raycasts or InstancedMesh BVH.
 *
 * The Box3D scene uses this to fade blocking cubes to a transparent "ghost" so the
 * player ball is never hidden behind an obstacle.
 */

/**
 * Does the segment p0→p1 intersect the axis-aligned cube centered at (cx,cy,cz)
 * with uniform half-extent `half`? Slab method clamped to the segment's [0,1] range.
 */
export function segmentIntersectsCube(
    p0x: number, p0y: number, p0z: number,
    p1x: number, p1y: number, p1z: number,
    cx: number, cy: number, cz: number,
    half: number
): boolean {
    const dx = p1x - p0x, dy = p1y - p0y, dz = p1z - p0z
    let tmin = 0, tmax = 1
    const EPS = 1e-9

    // X slab
    if (Math.abs(dx) < EPS) {
        if (p0x < cx - half || p0x > cx + half) return false
    } else {
        let t1 = (cx - half - p0x) / dx
        let t2 = (cx + half - p0x) / dx
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
        tmin = Math.max(tmin, t1)
        tmax = Math.min(tmax, t2)
        if (tmin > tmax) return false
    }
    // Y slab
    if (Math.abs(dy) < EPS) {
        if (p0y < cy - half || p0y > cy + half) return false
    } else {
        let t1 = (cy - half - p0y) / dy
        let t2 = (cy + half - p0y) / dy
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
        tmin = Math.max(tmin, t1)
        tmax = Math.min(tmax, t2)
        if (tmin > tmax) return false
    }
    // Z slab
    if (Math.abs(dz) < EPS) {
        if (p0z < cz - half || p0z > cz + half) return false
    } else {
        let t1 = (cz - half - p0z) / dz
        let t2 = (cz + half - p0z) / dz
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
        tmin = Math.max(tmin, t1)
        tmax = Math.min(tmax, t2)
        if (tmin > tmax) return false
    }
    return true
}

export interface Vec3ish { x: number; y: number; z: number }

/**
 * Indices of cubes whose AABB the camera→player sightline passes through, nearest
 * to the camera first, capped at `maxCount`. The segment is shortened by `endPad`
 * near the player so a cube the ball is resting against doesn't strobe in and out.
 */
export function findOccludingCubes(
    cam: Vec3ish,
    player: Vec3ish,
    centers: Vec3ish[],
    half: number,
    maxCount = 8,
    endPad = 0.6
): number[] {
    const dx = player.x - cam.x, dy = player.y - cam.y, dz = player.z - cam.z
    const len = Math.hypot(dx, dy, dz)
    // Pull the end back toward the camera by endPad so cubes at the player don't flicker.
    const shrink = len > endPad ? (len - endPad) / len : 1
    const p1x = cam.x + dx * shrink
    const p1y = cam.y + dy * shrink
    const p1z = cam.z + dz * shrink

    const hits: { i: number; d: number }[] = []
    for (let i = 0; i < centers.length; i++) {
        const c = centers[i]
        if (segmentIntersectsCube(cam.x, cam.y, cam.z, p1x, p1y, p1z, c.x, c.y, c.z, half)) {
            const d = (c.x - cam.x) ** 2 + (c.y - cam.y) ** 2 + (c.z - cam.z) ** 2
            hits.push({ i, d })
        }
    }
    hits.sort((a, b) => a.d - b.d)
    const out: number[] = []
    for (let k = 0; k < hits.length && k < maxCount; k++) out.push(hits[k].i)
    return out
}
