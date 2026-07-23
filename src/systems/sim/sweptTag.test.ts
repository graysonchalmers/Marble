import { describe, it, expect } from 'vitest'
import { sweptMinDistance } from './sweptTag'

describe('sweptMinDistance', () => {
    it('equals the endpoint distance when neither point moves', () => {
        // Both static, 2u apart on X.
        const d = sweptMinDistance(2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0)
        expect(d).toBeCloseTo(2, 6)
    })

    it('catches a fast graze that both endpoints miss (the tunneling case)', () => {
        // Player streaks left→right along y=0.3; enemy sits at the origin.
        // Start 3u to the left, end 3u to the right — both endpoints are 3.01u away,
        // but mid-step the player passes directly over the enemy at 0.3u.
        const a0 = [-3, 0.3, 0], a1 = [3, 0.3, 0]
        const b = [0, 0, 0]
        const endpointStart = Math.hypot(a0[0], a0[1], a0[2]) // ~3.015
        const endpointEnd = Math.hypot(a1[0], a1[1], a1[2])   // ~3.015
        const swept = sweptMinDistance(
            a0[0], a0[1], a0[2], a1[0], a1[1], a1[2],
            b[0], b[1], b[2], b[0], b[1], b[2],
        )
        expect(endpointStart).toBeGreaterThan(3)
        expect(endpointEnd).toBeGreaterThan(3)
        // Closest approach is the perpendicular y-offset only.
        expect(swept).toBeCloseTo(0.3, 6)
        // A default tag threshold (~0.5+0.5+0.25) would now register this graze.
        expect(swept).toBeLessThan(1.25)
    })

    it('accounts for both points moving (relative motion), not just one', () => {
        // Player and enemy approach head-on along X and cross at the midpoint.
        const swept = sweptMinDistance(
            -2, 0, 0, 2, 0, 0,   // player -2 → +2
            2, 0.4, 0, -2, 0.4, 0, // enemy +2 → -2, offset 0.4 in Y
        )
        // They swap sides; closest approach is the 0.4u Y separation at the crossing.
        expect(swept).toBeCloseTo(0.4, 6)
    })

    it('never exceeds the smaller endpoint distance', () => {
        const a0 = [5, 0, 0], a1 = [1, 0, 0]
        const b0 = [0, 0, 0], b1 = [0, 0, 0]
        const swept = sweptMinDistance(a0[0], a0[1], a0[2], a1[0], a1[1], a1[2], b0[0], b0[1], b0[2], b1[0], b1[1], b1[2])
        expect(swept).toBeLessThanOrEqual(1 + 1e-9) // the nearer endpoint is 1u
    })
})
