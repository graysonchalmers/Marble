import { describe, it, expect } from 'vitest'
import { computeYourPlacing, type RecordEntry } from './records'

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
