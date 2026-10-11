import { describe, it, expect } from 'vitest'
import {
    createBeliefGrid, spreadBelief, observeBelief, pickBeliefTarget, beliefSearchTarget, resetBelief, cellAt, cellX, cellZ,
} from './beliefSearch'

const sum = (b: Float32Array) => b.reduce((s, v) => s + v, 0)
const grid = (isOpen = (_x: number, _z: number) => true) => createBeliefGrid(-20, -20, 20, 20, 4, isOpen)   // 10 x 10

describe('beliefSearch (lab hunter port)', () => {
    it('starts uniform over open cells and never puts mass in a closed one', () => {
        const g = grid((x, z) => !(Math.abs(x) < 4 && Math.abs(z) < 4))   // a 2x2-cell block in the middle
        expect(sum(g.belief)).toBeCloseTo(1, 5)
        expect(g.belief[cellAt(g, 0.5, 0.5)]).toBe(0)
        for (let i = 0; i < 20; i++) spreadBelief(g, 0.5)
        expect(sum(g.belief)).toBeCloseTo(1, 5)          // spread conserves mass
        expect(g.belief[cellAt(g, 0.5, 0.5)]).toBe(0)     // and never leaks into the block
    })

    it('collapses onto the player when seen, then spreads out from there', () => {
        const g = grid()
        observeBelief(g, true, 5, -7, 0, 0, 40, () => false)
        expect(g.belief[cellAt(g, 5, -7)]).toBe(1)
        spreadBelief(g, 0.5)
        expect(g.belief[cellAt(g, 5, -7)]).toBeCloseTo(0.5, 5)
        expect(sum(g.belief)).toBeCloseTo(1, 5)
    })

    it('zeroes every cell it can see, within range only, and renormalises', () => {
        const g = grid()
        const seenCell = (x: number) => x < 0                     // the enemy "sees" the west half
        observeBelief(g, false, 0, 0, 0, 0, 1000, (x) => seenCell(x))
        for (let n = 0; n < g.belief.length; n++) expect(g.belief[n] === 0).toBe(seenCell(cellX(g, n)))
        expect(sum(g.belief)).toBeCloseTo(1, 5)
        const h = grid()
        observeBelief(h, false, 0, 0, -18, -18, 5, () => true)  // short range: only the corner clears
        expect(h.belief[cellAt(h, -18, -18)]).toBe(0)
        expect(h.belief[cellAt(h, 18, 18)]).toBeGreaterThan(0)
    })

    it('starts over when everything is ruled out', () => {
        const g = grid()
        observeBelief(g, false, 0, 0, 0, 0, 1000, () => true)
        expect(sum(g.belief)).toBeCloseTo(1, 5)
        expect(g.belief[0]).toBeCloseTo(1 / 100, 5)
    })

    it('targets where the mass is, preferring nearer at equal mass', () => {
        const g = grid()
        g.belief.fill(0)
        g.belief[cellAt(g, 14, 14)] = 0.5
        g.belief[cellAt(g, -14, -14)] = 0.5
        expect(pickBeliefTarget(g, -10, -10)).toBe(true)
        expect([g.targetX, g.targetZ]).toEqual([cellX(g, cellAt(g, -14, -14)), cellZ(g, cellAt(g, -14, -14))])
    })

    it('keeps a target until reached or stale, then re-plans', () => {
        const g = grid()
        g.belief.fill(0)
        g.belief[cellAt(g, 14, 14)] = 1
        expect(beliefSearchTarget(g, 0, 0)).toBe(true)
        const t = [g.targetX, g.targetZ]
        g.belief.fill(0)
        g.belief[cellAt(g, -14, -14)] = 1
        beliefSearchTarget(g, 0, 0)
        expect([g.targetX, g.targetZ]).toEqual(t)        // not stale yet
        beliefSearchTarget(g, 0, 0); beliefSearchTarget(g, 0, 0)
        expect([g.targetX, g.targetZ]).not.toEqual(t)    // re-planned after BELIEF_REPLAN_TICKS
        resetBelief(g)
        expect(g.hasTarget).toBe(false)
    })
})
