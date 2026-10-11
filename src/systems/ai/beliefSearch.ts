/**
 * Belief-map search (ported from Tool-BehaviorLab's `hunter` brain, 2026-10-11).
 *
 * belief[n] = probability the player is in XZ cell n. Each AI tick: spread it (the player may have moved, at an
 * assumed speed), then either collapse it onto the player's cell (seen) or zero every cell the enemy can see from
 * where it is (the player isn't there). While searching, the enemy heads for the cell with the best
 * belief-per-distance instead of cycling fixed waypoints, so it sweeps where the player could actually be.
 *
 * Pure and allocation-free after creation: no THREE, no RNG (F9-safe). Sight is injected (`canSeePoint`) so
 * MarbleSim supplies its raycast and tests supply a stub.
 */

export interface BeliefGrid {
    readonly minX: number
    readonly minZ: number
    readonly cell: number
    readonly cols: number
    readonly rows: number
    readonly open: Uint8Array        // 1 = the player can be here (not inside an obstacle)
    readonly belief: Float32Array    // sums to 1 over open cells
    readonly next: Float32Array      // spread scratch
    targetX: number
    targetZ: number
    hasTarget: boolean
    replanIn: number                 // AI ticks until the target goes stale
}

/** Ticks between target re-plans while searching (10 Hz AI: 0.3 s), and the reach distance that forces one. */
export const BELIEF_REPLAN_TICKS = 3
export const BELIEF_REACH = 3

export function createBeliefGrid(
    minX: number, minZ: number, maxX: number, maxZ: number, cell: number,
    isOpen: (x: number, z: number) => boolean,
): BeliefGrid {
    const cols = Math.ceil((maxX - minX) / cell), rows = Math.ceil((maxZ - minZ) / cell), n = cols * rows
    const open = new Uint8Array(n)
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) open[r * cols + c] = isOpen(minX + (c + 0.5) * cell, minZ + (r + 0.5) * cell) ? 1 : 0
    const g: BeliefGrid = {
        minX, minZ, cell, cols, rows, open, belief: new Float32Array(n), next: new Float32Array(n),
        targetX: 0, targetZ: 0, hasTarget: false, replanIn: 0,
    }
    resetBelief(g)
    return g
}

/** Back to "could be anywhere open". */
export function resetBelief(g: BeliefGrid): void {
    let k = 0
    for (let i = 0; i < g.open.length; i++) k += g.open[i]
    for (let i = 0; i < g.open.length; i++) g.belief[i] = k ? g.open[i] / k : 0
    g.hasTarget = false
    g.replanIn = 0
}

export const cellX = (g: BeliefGrid, n: number) => g.minX + ((n % g.cols) + 0.5) * g.cell
export const cellZ = (g: BeliefGrid, n: number) => g.minZ + (Math.floor(n / g.cols) + 0.5) * g.cell
export function cellAt(g: BeliefGrid, x: number, z: number): number {
    const c = Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.minX) / g.cell)))
    const r = Math.min(g.rows - 1, Math.max(0, Math.floor((z - g.minZ) / g.cell)))
    return r * g.cols + c
}

/** Mass-conserving 4-neighbour spread; alpha = share of a cell's mass that moves out per tick (0..1). */
export function spreadBelief(g: BeliefGrid, alpha: number): void {
    const { belief: b, next, open, cols, rows } = g
    next.fill(0)
    for (let n = 0; n < b.length; n++) {
        if (!b[n]) continue
        const c = n % cols, r = (n - c) / cols
        const L = c > 0 ? open[n - 1] : 0, R = c < cols - 1 ? open[n + 1] : 0
        const U = r > 0 ? open[n - cols] : 0, D = r < rows - 1 ? open[n + cols] : 0
        const k = L + R + U + D
        const out = k ? alpha * b[n] : 0
        next[n] += b[n] - out
        if (L) next[n - 1] += out / k
        if (R) next[n + 1] += out / k
        if (U) next[n - cols] += out / k
        if (D) next[n + cols] += out / k
    }
    b.set(next)
}

/**
 * One observation. Seen: collapse onto the player's cell. Not seen: zero every cell within `range` of the enemy
 * that `canSeePoint` says is visible, then renormalise (all ruled out -> start over).
 */
export function observeBelief(
    g: BeliefGrid, seen: boolean, playerX: number, playerZ: number, enemyX: number, enemyZ: number, range: number,
    canSeePoint: (x: number, z: number) => boolean,
): void {
    const b = g.belief
    if (seen) {
        b.fill(0)
        b[cellAt(g, playerX, playerZ)] = 1
        return
    }
    const r2 = range * range
    let sum = 0
    for (let n = 0; n < b.length; n++) {
        if (!b[n]) continue
        const dx = cellX(g, n) - enemyX, dz = cellZ(g, n) - enemyZ
        if (dx * dx + dz * dz <= r2 && canSeePoint(cellX(g, n), cellZ(g, n))) b[n] = 0
        else sum += b[n]
    }
    if (sum > 0) for (let n = 0; n < b.length; n++) b[n] /= sum
    else resetBelief(g)
}

/** Best belief-per-distance cell (a little neighbour mass so dense regions win), straight-line distance. */
export function pickBeliefTarget(g: BeliefGrid, enemyX: number, enemyZ: number): boolean {
    const { belief: b, cols, rows } = g
    let best = -1, bestScore = 0
    for (let n = 0; n < b.length; n++) {
        if (!b[n]) continue
        const c = n % cols, r = (n - c) / cols
        let mass = b[n]
        if (c > 0) mass += 0.5 * b[n - 1]
        if (c < cols - 1) mass += 0.5 * b[n + 1]
        if (r > 0) mass += 0.5 * b[n - cols]
        if (r < rows - 1) mass += 0.5 * b[n + cols]
        const score = mass / (Math.hypot(cellX(g, n) - enemyX, cellZ(g, n) - enemyZ) + 20)
        if (score > bestScore) { bestScore = score; best = n }
    }
    g.hasTarget = best >= 0
    if (g.hasTarget) { g.targetX = cellX(g, best); g.targetZ = cellZ(g, best) }
    return g.hasTarget
}

/** Search-state target: keep the current one until it is reached or stale, then re-plan. */
export function beliefSearchTarget(g: BeliefGrid, enemyX: number, enemyZ: number): boolean {
    const reached = g.hasTarget && Math.hypot(g.targetX - enemyX, g.targetZ - enemyZ) < BELIEF_REACH
    if (!g.hasTarget || reached || --g.replanIn <= 0) {
        pickBeliefTarget(g, enemyX, enemyZ)
        g.replanIn = BELIEF_REPLAN_TICKS
    }
    return g.hasTarget
}
