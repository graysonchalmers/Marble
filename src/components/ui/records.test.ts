import { describe, it, expect } from 'vitest'
import { computeYourPlacing, computePlacingWindow, type RecordEntry } from './records'

const mk = (t: number): RecordEntry => ({ date: 'x', timeAlive: t })
// A full stored leaderboard, sorted best→worst (top 10).
const recs = [mk(50), mk(40), mk(30), mk(25), mk(20), mk(15), mk(12), mk(10), mk(8), mk(5)]

describe('computeYourPlacing', () => {
    it('returns null when the run is inside the visible top-5 (highlighted in place)', () => {
        expect(computeYourPlacing(recs, 50, 5, 'today')).toBeNull() // rank 1
        expect(computeYourPlacing(recs, 20, 5, 'today')).toBeNull() // rank 5 (last visible)
    })

    it('appends the exact placing for a run ranked 6–10', () => {
        const six = computeYourPlacing(recs, 15, 5, 'today') // rank 6 — first hidden
        expect(six).toEqual({ record: mk(15), rankLabel: '#6', beyondTracked: false })

        const seven = computeYourPlacing(recs, 12, 5, 'today') // rank 7
        expect(seven?.rankLabel).toBe('#7')
        expect(seven?.record.timeAlive).toBe(12)
        expect(seven?.beyondTracked).toBe(false)
    })

    it('marks a beyond-top-10 run as "#11+" using the live score + today label', () => {
        const p = computeYourPlacing(recs, 3, 5, 'today') // worse than all 10 → idx -1
        expect(p).toEqual({ record: { date: 'today', timeAlive: 3 }, rankLabel: '#11+', beyondTracked: true })
    })

    it('returns null with a short list where the run is among the visible entries', () => {
        const few = [mk(50), mk(30)]
        expect(computeYourPlacing(few, 30, 5, 'today')).toBeNull()
    })

    it('returns null for an empty leaderboard', () => {
        expect(computeYourPlacing([], 42, 5, 'today')).toBeNull()
    })
})

describe('computePlacingWindow', () => {
    it('returns null when the run is inside the visible top-5', () => {
        expect(computePlacingWindow(recs, 50, 5, 'today')).toBeNull() // rank 1
        expect(computePlacingWindow(recs, 20, 5, 'today')).toBeNull() // rank 5
    })

    it('returns null for an empty leaderboard', () => {
        expect(computePlacingWindow([], 42, 5, 'today')).toBeNull()
    })

    it('shows a neighbour window centred on your rank (radius 1)', () => {
        // rank 7 (idx 6) → window idx 5..7 = ranks #6,#7,#8, with #7 flagged isYou.
        const win = computePlacingWindow(recs, 12, 5, 'today', 1)
        expect(win?.map(r => r.rankLabel)).toEqual(['#6', '#7', '#8'])
        expect(win?.map(r => r.isYou)).toEqual([false, true, false])
        expect(win?.find(r => r.isYou)?.record.timeAlive).toBe(12)
    })

    it('clamps the window start so it never overlaps the visible slice', () => {
        // rank 6 (idx 5, first hidden) → start clamps to visibleCount 5, no rank #5 dup.
        const win = computePlacingWindow(recs, 15, 5, 'today', 1)
        expect(win?.map(r => r.rankLabel)).toEqual(['#6', '#7'])
        expect(win?.[0].isYou).toBe(true)
    })

    it('clamps the window end at the bottom of the stored list', () => {
        // rank 10 (idx 9, last) → window idx 8..9 = #9,#10.
        const win = computePlacingWindow(recs, 5, 5, 'today', 1)
        expect(win?.map(r => r.rankLabel)).toEqual(['#9', '#10'])
        expect(win?.[win.length - 1].isYou).toBe(true)
    })

    it('marks a beyond-list run as a single "#N+" row', () => {
        const win = computePlacingWindow(recs, 3, 5, 'today', 1) // worse than all 10
        expect(win).toEqual([{ record: { date: 'today', timeAlive: 3 }, rankLabel: '#11+', isYou: true, beyondTracked: true }])
    })
})
