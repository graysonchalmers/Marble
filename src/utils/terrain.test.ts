/**
 * Unit tests for utils/terrain.ts — the unified terrain source of truth + the Feature B
 * variable-floor roughness field. Pure functions, no world/WASM needed.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
    getTerrainHeight,
    getTerrainNormal,
    terrainRoughnessAt,
    setTerrainRoughness,
    getTerrainRoughness,
    generateTerrainHeights,
} from './terrain'
import { TERRAIN, OBSTACLES, DEFAULT_TERRAIN_ROUGHNESS } from '../systems/sim/tuning'

// Roughness is module-level state; reset before each test so ordering can't leak.
beforeEach(() => setTerrainRoughness(DEFAULT_TERRAIN_ROUGHNESS))

describe('getTerrainHeight', () => {
    it('is deterministic (same input → same output)', () => {
        expect(getTerrainHeight(12.5, -7.25)).toBe(getTerrainHeight(12.5, -7.25))
    })

    it('is finite across the arena', () => {
        for (let x = -60; x <= 60; x += 13) {
            for (let z = -60; z <= 60; z += 13) {
                expect(Number.isFinite(getTerrainHeight(x, z))).toBe(true)
            }
        }
    })
})

describe('variable-floor roughness (Feature B)', () => {
    it('setTerrainRoughness(0) flattens the roughness field everywhere', () => {
        setTerrainRoughness(0)
        expect(getTerrainRoughness()).toBe(0)
        for (let x = -60; x <= 60; x += 11) {
            for (let z = -60; z <= 60; z += 11) {
                expect(terrainRoughnessAt(x, z)).toBe(0)
            }
        }
    })

    it('clamps negative / non-finite amplitude to 0', () => {
        setTerrainRoughness(-5)
        expect(getTerrainRoughness()).toBe(0)
        setTerrainRoughness(Number.NaN)
        expect(getTerrainRoughness()).toBe(0)
    })

    it('keeps the spawn ring (inside the clear radius) perfectly smooth at any amplitude', () => {
        setTerrainRoughness(1.5)
        // Sample points well inside the clear radius — roughness must be exactly 0.
        for (const [x, z] of [[0, 0], [5, 0], [0, -8], [10, 10]] as const) {
            expect(Math.hypot(x, z)).toBeLessThan(OBSTACLES.clearRadius)
            expect(terrainRoughnessAt(x, z)).toBe(0)
        }
    })

    it('scales linearly with amplitude in the rough zones', () => {
        setTerrainRoughness(1)
        const r1 = terrainRoughnessAt(30, 30) // a point in a rough patch, outside the clear ring
        setTerrainRoughness(0.5)
        const rHalf = terrainRoughnessAt(30, 30)
        expect(r1).not.toBe(0)
        expect(rHalf).toBeCloseTo(r1 / 2, 6)
    })

    it('roughens the ground somewhere but never inside the clear radius (via the height array)', () => {
        const { width, depth, scale } = TERRAIN
        const halfW = ((width - 1) * scale) / 2
        const halfD = ((depth - 1) * scale) / 2

        setTerrainRoughness(0)
        const flat = generateTerrainHeights()
        setTerrainRoughness(1)
        const rough = generateTerrainHeights()

        let changed = 0
        for (let gz = 0; gz < depth; gz++) {
            for (let gx = 0; gx < width; gx++) {
                const i = gz * width + gx
                const wx = gx * scale - halfW
                const wz = gz * scale - halfD
                if (Math.hypot(wx, wz) < OBSTACLES.clearRadius) {
                    // Inside the clear ring the collider must be identical with/without roughness.
                    expect(rough[i]).toBe(flat[i])
                } else if (rough[i] !== flat[i]) {
                    changed++
                }
            }
        }
        // Roughness actually did something out in the arena.
        expect(changed).toBeGreaterThan(0)
    })
})

describe('generateTerrainHeights (single source of truth)', () => {
    it('has one entry per grid vertex', () => {
        expect(generateTerrainHeights()).toHaveLength(TERRAIN.width * TERRAIN.depth)
    })

    it('equals getTerrainHeight at each vertex world position (collider == analytic)', () => {
        const { width, depth, scale } = TERRAIN
        const halfW = ((width - 1) * scale) / 2
        const halfD = ((depth - 1) * scale) / 2
        const heights = generateTerrainHeights()
        // Spot-check a handful of vertices — proves the heightfield and the sim's analytic
        // terrain are the SAME function (the whole point of the Feature B unification).
        for (const [gx, gz] of [[0, 0], [10, 20], [32, 32], [63, 63], [40, 5]] as const) {
            const i = gz * width + gx
            const wx = gx * scale - halfW
            const wz = gz * scale - halfD
            expect(heights[i]).toBeCloseTo(getTerrainHeight(wx, wz), 6)
        }
    })

    it('normals stay upward (y > 0) — bumps are navigable, not overhangs', () => {
        setTerrainRoughness(1)
        for (const [x, z] of [[30, 30], [-35, 25], [42, -18]] as const) {
            expect(getTerrainNormal(x, z).y).toBeGreaterThan(0)
        }
    })
})
