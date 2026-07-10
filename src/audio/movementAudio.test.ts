import { describe, it, expect } from 'vitest'
import { computeMovementAudioParams, MOVEMENT_AUDIO as C } from './movementAudio'

describe('computeMovementAudioParams', () => {
    it('is silent at rest', () => {
        const p = computeMovementAudioParams(0, 0, true)
        expect(p.rollGain).toBe(0)
        expect(p.windGain).toBe(0)
        expect(p.rollCutoff).toBe(C.rollMinCutoff)
    })

    it('roll rises with ground speed and brightens the cutoff', () => {
        const slow = computeMovementAudioParams(4, 4, true)
        const fast = computeMovementAudioParams(18, 18, true)
        expect(fast.rollGain).toBeGreaterThan(slow.rollGain)
        expect(fast.rollCutoff).toBeGreaterThan(slow.rollCutoff)
        expect(fast.rollGain).toBeLessThanOrEqual(C.rollMaxGain + 1e-9)
    })

    it('produces no roll while airborne (even at high ground speed)', () => {
        const p = computeMovementAudioParams(18, 18, false)
        expect(p.rollGain).toBe(0)
    })

    it('roll gain saturates at rollMaxGain past rollMaxSpeed', () => {
        const p = computeMovementAudioParams(999, 999, true)
        expect(p.rollGain).toBeCloseTo(C.rollMaxGain, 6)
        expect(p.rollCutoff).toBeCloseTo(C.rollMaxCutoff, 6)
    })

    it('wind only starts above windMinSpeed and ramps up', () => {
        expect(computeMovementAudioParams(5, 5, true).windGain).toBe(0) // below threshold
        const mid = computeMovementAudioParams(20, 20, true).windGain
        const high = computeMovementAudioParams(30, 30, true).windGain
        expect(high).toBeGreaterThan(mid)
        expect(mid).toBeGreaterThan(0)
    })

    it('wind is louder airborne than grounded at the same speed', () => {
        const air = computeMovementAudioParams(0, 25, false).windGain
        const ground = computeMovementAudioParams(25, 25, true).windGain
        expect(air).toBeGreaterThan(ground)
    })
})
