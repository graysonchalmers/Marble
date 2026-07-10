/**
 * components/ui/records.ts — pure helpers for the records / leaderboard UI.
 *
 * Kept React-free so the placing logic (which row to append below the visible
 * top-N on the game-over screen) is unit-testable headlessly.
 */

export interface RecordEntry {
    date: string
    timeAlive: number
}

export interface PlacingRow {
    /** The record to render in the appended "your placing" row. */
    record: RecordEntry
    /** Display label for the rank cell, e.g. "#7" or "#11+" (beyond the tracked list). */
    rankLabel: string
    /** True when the exact place is unknown because the run fell outside the stored list. */
    beyondTracked: boolean
}

/**
 * Decide whether to append a highlighted "your placing" row beneath the visible
 * top-`visibleCount` on the game-over screen.
 *
 * `records` is the stored leaderboard, already sorted best→worst and capped (top 10),
 * and — by the time the game-over screen renders — it already contains the current
 * run if that run made the cut (RulesSystem calls saveRecord on the gameover tick).
 *
 * Returns:
 *  - `null` when the current run is already visible within the top `visibleCount`
 *    (it's highlighted in place, no extra row needed), or when there are no records.
 *  - a `PlacingRow` when the run ranks below the visible slice: its exact place
 *    (`#6`..`#10`) when it's in the stored list, or `#N+` (beyond the tracked top-N)
 *    when the run was worse than everything stored — we still show the live time so
 *    the player can compare against the top five.
 */
export function computeYourPlacing(
    records: RecordEntry[],
    score: number,
    visibleCount: number,
    todayLabel: string,
    eps = 0.001
): PlacingRow | null {
    if (!records || records.length === 0) return null

    const idx = records.findIndex(r => Math.abs(r.timeAlive - score) < eps) // -1 = beyond the stored list
    const isShown = idx >= 0 && idx < visibleCount
    if (isShown) return null

    if (idx >= 0) {
        return { record: records[idx], rankLabel: `#${idx + 1}`, beyondTracked: false }
    }

    // Beyond the tracked list: time is known, exact place isn't. Rank is at least length+1.
    return {
        record: { date: todayLabel, timeAlive: score },
        rankLabel: `#${records.length + 1}+`,
        beyondTracked: true,
    }
}

export interface PlacingWindowRow {
    record: RecordEntry
    /** Display label for the rank cell, e.g. "#7" or "#101+". */
    rankLabel: string
    /** True for the current run's own row (highlighted). */
    isYou: boolean
    /** True when this row is the current run and it fell outside the stored list. */
    beyondTracked?: boolean
}

/**
 * Build the "zoom to your rank" window shown beneath the visible top-`visibleCount`
 * on the game-over screen (now that we track up to 100 runs, a single row wasn't enough
 * context). Returns a short window of neighbours centred on the player's place — `radius`
 * rows on each side — so you can see who's just ahead and just behind you.
 *
 * Returns:
 *  - `null` when the current run is already inside the visible top-`visibleCount`
 *    (highlighted in place — no zoom row needed), or when there are no records.
 *  - a single beyond-tracked row (`#N+`) when the run is worse than everything stored.
 *  - otherwise the neighbour window, clamped so it never overlaps the visible slice
 *    (start ≥ `visibleCount`) and never runs past the end of the stored list.
 */
export function computePlacingWindow(
    records: RecordEntry[],
    score: number,
    visibleCount: number,
    todayLabel: string,
    radius = 1,
    eps = 0.001
): PlacingWindowRow[] | null {
    if (!records || records.length === 0) return null

    const idx = records.findIndex(r => Math.abs(r.timeAlive - score) < eps)
    if (idx >= 0 && idx < visibleCount) return null // already shown in the top slice

    if (idx < 0) {
        // Beyond the stored list: time known, exact place isn't.
        return [{
            record: { date: todayLabel, timeAlive: score },
            rankLabel: `#${records.length + 1}+`,
            isYou: true,
            beyondTracked: true,
        }]
    }

    const start = Math.max(visibleCount, idx - radius)
    const end = Math.min(records.length - 1, idx + radius)
    const rows: PlacingWindowRow[] = []
    for (let i = start; i <= end; i++) {
        rows.push({ record: records[i], rankLabel: `#${i + 1}`, isYou: i === idx })
    }
    return rows
}
