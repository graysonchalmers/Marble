import { describe, it, expect } from 'vitest'
import {
    PLAYFEEL_PRESETS,
    DEFAULT_PLAYFEEL_PRESET,
    PHYSICS_PRESETS,
    type PlayfeelPresetName
} from './tuning'
import { DEFAULT_SETTINGS } from '../../state/persistence'

describe('PLAYFEEL_PRESETS', () => {
    const names = Object.keys(PLAYFEEL_PRESETS) as PlayfeelPresetName[]

    it('exposes the five expected presets', () => {
        expect(names.sort()).toEqual(['arcade', 'classic', 'heavyweight', 'iceRink', 'predator'])
    })

    it('every preset is well-formed (valid physics preset + sane ranges)', () => {
        for (const n of names) {
            const p = PLAYFEEL_PRESETS[n]
            expect(p.label.length).toBeGreaterThan(0)
            expect(PHYSICS_PRESETS[p.physicsPreset]).toBeDefined()
            expect(p.playerDrift).toBeGreaterThanOrEqual(0)
            expect(p.playerDrift).toBeLessThanOrEqual(1)
            expect(p.downhillRoll).toBeGreaterThanOrEqual(0)
            expect(p.downhillRoll).toBeLessThanOrEqual(1)
            expect(p.jumpHeight).toBeGreaterThan(0)
            expect(p.enemySpeed).toBeGreaterThan(0)
        }
    })

    it('the default preset is "classic" and matches the shipped DEFAULT_SETTINGS feel', () => {
        expect(DEFAULT_PLAYFEEL_PRESET).toBe('classic')
        const c = PLAYFEEL_PRESETS.classic
        expect(DEFAULT_SETTINGS.physicsPreset).toBe(c.physicsPreset)
        expect(DEFAULT_SETTINGS.playerDrift).toBe(c.playerDrift)
        expect(DEFAULT_SETTINGS.downhillRoll).toBe(c.downhillRoll)
        expect(DEFAULT_SETTINGS.jumpHeight).toBe(c.jumpHeight)
        expect(DEFAULT_SETTINGS.enemySpeed).toBe(c.enemySpeed)
        expect(DEFAULT_SETTINGS.playfeelPreset).toBe('classic')
    })

    it('presets are meaningfully different (Ice Rink drifts more than Arcade)', () => {
        expect(PLAYFEEL_PRESETS.iceRink.playerDrift).toBeGreaterThan(PLAYFEEL_PRESETS.arcade.playerDrift)
        expect(PLAYFEEL_PRESETS.predator.enemySpeed).toBeGreaterThan(PLAYFEEL_PRESETS.classic.enemySpeed)
    })
})
