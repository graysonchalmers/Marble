import { describe, it, expect } from 'vitest'
import {
    PHYSICS_PRESETS,
    DEFAULT_PHYSICS_PRESET,
    WORLD,
    PLAYER,
    TERRAIN,
    type PhysicsPresetName
} from './tuning'

/**
 * Physics feel presets (traction A/B — STATUS.md Known issue #4 + Phase E).
 * These guard the preset *contract* without needing the WASM bridge: the sim
 * consumes `physics.playerFriction / terrainFriction / jumpImpulse` and the scene
 * consumes `physics.gravityY`, so the values here must stay coherent.
 */
describe('PHYSICS_PRESETS', () => {
    const names: PhysicsPresetName[] = ['current', 'v1Gravity', 'blend']

    it('exposes exactly the three expected presets', () => {
        expect(Object.keys(PHYSICS_PRESETS).sort()).toEqual([...names].sort())
    })

    it('default preset is "current"', () => {
        expect(DEFAULT_PHYSICS_PRESET).toBe('current')
    })

    it('"current" matches the shipped scalar tuning constants (no baseline drift)', () => {
        // If someone retunes the individual constants, this catches the preset going stale.
        expect(PHYSICS_PRESETS.current.gravityY).toBe(WORLD.gravityY)
        expect(PHYSICS_PRESETS.current.jumpImpulse).toBe(PLAYER.jumpImpulse)
        expect(PHYSICS_PRESETS.current.playerFriction).toBe(PLAYER.friction)
        expect(PHYSICS_PRESETS.current.terrainFriction).toBe(TERRAIN.friction)
    })

    it('every preset has finite, physically-sane values', () => {
        for (const n of names) {
            const p = PHYSICS_PRESETS[n]
            expect(p.gravityY).toBeLessThan(0)                 // gravity pulls down
            expect(p.jumpImpulse).toBeGreaterThan(0)
            expect(p.playerFriction).toBeGreaterThan(0)
            expect(p.terrainFriction).toBeGreaterThan(0)
        }
    })

    it('v1Gravity isolates the gravity lever (heavier weight, rescaled jump, friction untouched)', () => {
        const base = PHYSICS_PRESETS.current
        const b = PHYSICS_PRESETS.v1Gravity

        // Raises weight (and rescales jump to hold height) without touching friction.
        expect(b.gravityY).toBeLessThan(base.gravityY)          // more negative = heavier
        expect(b.jumpImpulse).toBeGreaterThan(base.jumpImpulse) // rescaled up to hold height
        expect(b.playerFriction).toBe(base.playerFriction)
        expect(b.terrainFriction).toBe(base.terrainFriction)
    })
})
