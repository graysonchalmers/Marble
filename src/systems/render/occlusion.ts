/**
 * systems/render/occlusion.ts — analytic camera→player occlusion.
 *
 * Pure geometry (no THREE, no scene graph, no raycaster): given the camera and
 * player positions and the static obstacle centers, return which obstacles the
 * sightline passes through. Deterministic and cheap (one segment-vs-AABB test per
 * obstacle), so it's unit-testable and doesn't depend on WASM raycasts or
 * InstancedMesh BVH.
 *
 * The Box3D scene uses this to fade blocking obstacles to a transparent "ghost" so
 * the player ball is never hidden behind one. Cubes use a uniform half-extent;
 * columns (tall pillars) use non-uniform extents (wide × tall × wide) — both go
 * through the same box test.
 */

/**
 * Does the segment p0→p1 intersect the axis-aligned box centered at (cx,cy,cz)
 * with per-axis half-extents (hx,hy,hz)? Slab method clamped to the segment's
 * [0,1] range.
 */
export function segmentIntersectsBox(
    p0x: number, p0y: number, p0z: number,
    p1x: number, p1y: number, p1z: number,
    cx: number, cy: number, cz: number,
    hx: number, hy: number, hz: number
): boolean {
    const dx = p1x - p0x, dy = p1y - p0y, dz = p1z - p0z
    let tmin = 0, tmax = 1
    const EPS = 1e-9

    // X slab
    if (Math.abs(dx) < EPS) {
        if (p0x < cx - hx || p0x > cx + hx) return false
    } else {
        let t1 = (cx - hx - p0x) / dx
        let t2 = (cx + hx - p0x) / dx
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
        tmin = Math.max(tmin, t1)
        tmax = Math.min(tmax, t2)
        if (tmin > tmax) return false
    }
    // Y slab
    if (Math.abs(dy) < EPS) {
        if (p0y < cy - hy || p0y > cy + hy) return false
    } else {
        let t1 = (cy - hy - p0y) / dy
        let t2 = (cy + hy - p0y) / dy
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
        tmin = Math.max(tmin, t1)
        tmax = Math.min(tmax, t2)
        if (tmin > tmax) return false
    }
    // Z slab
    if (Math.abs(dz) < EPS) {
        if (p0z < cz - hz || p0z > cz + hz) return false
    } else {
        let t1 = (cz - hz - p0z) / dz
        let t2 = (cz + hz - p0z) / dz
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
        tmin = Math.max(tmin, t1)
        tmax = Math.min(tmax, t2)
        if (tmin > tmax) return false
    }
    return true
}

/**
 * Uniform-cube convenience wrapper over {@link segmentIntersectsBox}. Kept so the
 * cube occlusion path and its tests stay byte-identical.
 */
export function segmentIntersectsCube(
    p0x: number, p0y: number, p0z: number,
    p1x: number, p1y: number, p1z: number,
    cx: number, cy: number, cz: number,
    half: number
): boolean {
    return segmentIntersectsBox(p0x, p0y, p0z, p1x, p1y, p1z, cx, cy, cz, half, half, half)
}

export interface Vec3ish { x: number; y: number; z: number }

/**
 * Indices of boxes whose AABB the camera→player sightline passes through, nearest
 * to the camera first, capped at `maxCount`. Per-axis half-extents (hx,hy,hz) let
 * this serve both cubes (uniform) and columns (wide × tall × wide). The segment is
 * shortened by `endPad` near the player so an obstacle the ball is resting against
 * doesn't strobe in and out.
 */
export function findOccludingBoxes(
    cam: Vec3ish,
    player: Vec3ish,
    centers: Vec3ish[],
    hx: number, hy: number, hz: number,
    maxCount = 8,
    endPad = 0.6,
    maxPlayerDist = Infinity
): number[] {
    const dx = player.x - cam.x, dy = player.y - cam.y, dz = player.z - cam.z
    const len = Math.hypot(dx, dy, dz)
    // Pull the end back toward the camera by endPad so obstacles at the player don't flicker.
    const shrink = len > endPad ? (len - endPad) / len : 1
    const p1x = cam.x + dx * shrink
    const p1y = cam.y + dy * shrink
    const p1z = cam.z + dz * shrink

    // Only fade obstacles within `maxPlayerDist` (horizontal, xz) of the player. When
    // the chase camera lags behind a fast ball the cam→player segment stretches across
    // the whole arena and would fade every obstacle along that long corridor ("all the
    // shapes vanish when I start moving"). At a normal follow distance the whole segment
    // is well inside this radius, so behavior is unchanged; the cap only trims the far,
    // near-camera end that appears when the camera trails. Vertical is ignored so a tall
    // pillar the ball is beside (center high above it) still counts.
    const maxPlayerDistSq = maxPlayerDist === Infinity ? Infinity : maxPlayerDist * maxPlayerDist

    const hits: { i: number; d: number }[] = []
    for (let i = 0; i < centers.length; i++) {
        const c = centers[i]
        if (segmentIntersectsBox(cam.x, cam.y, cam.z, p1x, p1y, p1z, c.x, c.y, c.z, hx, hy, hz)) {
            if (maxPlayerDistSq !== Infinity) {
                const pdx = c.x - player.x, pdz = c.z - player.z
                if (pdx * pdx + pdz * pdz > maxPlayerDistSq) continue
            }
            const d = (c.x - cam.x) ** 2 + (c.y - cam.y) ** 2 + (c.z - cam.z) ** 2
            hits.push({ i, d })
        }
    }
    hits.sort((a, b) => a.d - b.d)
    const out: number[] = []
    for (let k = 0; k < hits.length && k < maxCount; k++) out.push(hits[k].i)
    return out
}

/**
 * Uniform-cube convenience wrapper over {@link findOccludingBoxes} (half-extent on
 * all three axes). Kept so the cube occlusion path and its tests stay byte-identical.
 */
export function findOccludingCubes(
    cam: Vec3ish,
    player: Vec3ish,
    centers: Vec3ish[],
    half: number,
    maxCount = 8,
    endPad = 0.6
): number[] {
    return findOccludingBoxes(cam, player, centers, half, half, half, maxCount, endPad)
}
