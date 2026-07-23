/**
 * Unit tests for Phase P Feature E — launch ramps (cube → stepped-wedge conversion).
 *
 * Same mocked-bridge harness as MarbleSim.test.ts (no real WASM needed — construction is plain
 * TS over the bridge call surface). Guards the two things that matter: (1) determinism/backward-
 * compat — a 0/absent rampCubeRatio draws no RNG and converts nothing, so existing runs stay
 * byte-identical; (2) the conversion itself — bodies swapped, flags/facings set, seed-stable.
 */
import { describe, it, expect, vi } from 'vitest'
import { Box3DWorld } from '../../physics/box3d/Box3DWorld'
import type { MarbleBox3DBridgeExports } from '../../physics/box3d/box3dBridge'
import { MarbleSim } from './MarbleSim'
import { RAMP, ENEMY } from './tuning'

function makeBridge(): MarbleBox3DBridgeExports {
    const heap = new Float32Array(1024)
    let nextPtr = 8
    let nextBodyId = 100
    return {
        manifest: { version: '0.1.0', moduleUrl: '', wasmUrl: '' },
        module: {
            HEAPF32: heap,
            _malloc: vi.fn((size: number) => { const p = nextPtr; nextPtr += size; return p }),
            _free: vi.fn(),
            cwrap: vi.fn(),
        },
        bridgeVersion: vi.fn(() => 1),
        health: vi.fn(() => 1),
        worldCreate: vi.fn(() => 1),
        worldDestroy: vi.fn(),
        worldStep: vi.fn(() => 1),
        createStaticBox: vi.fn(() => nextBodyId++),
        createDynamicSphere: vi.fn(() => nextBodyId++),
        createDynamicBox: vi.fn(() => nextBodyId++),
        createHeightfield: vi.fn(() => nextBodyId++),
        bodyDestroy: vi.fn(),
        bodyApplyTorque: vi.fn(),
        bodyApplyForceToCenter: vi.fn(),
        bodyApplyLinearImpulseToCenter: vi.fn(),
        bodyGetLinearVelocity: vi.fn(() => 1),
        bodySetLinearVelocity: vi.fn(),
        bodyGetAngularVelocity: vi.fn(() => 1),
        bodySetAngularVelocity: vi.fn(),
        bodySetDamping: vi.fn(),
        bodySetTransform: vi.fn(),
        readBodyTransform: vi.fn((_b: number, outPtr: number) => {
            const o = outPtr / Float32Array.BYTES_PER_ELEMENT
            heap[o] = 0; heap[o + 1] = 0; heap[o + 2] = 0
            heap[o + 3] = 0; heap[o + 4] = 0; heap[o + 5] = 0; heap[o + 6] = 1
            return 1
        }),
        worldRaycast: vi.fn(() => 1),
    } satisfies MarbleBox3DBridgeExports
}

function makeWorld() {
    const bridge = makeBridge()
    const world = new Box3DWorld(bridge)
    vi.mocked(bridge.createStaticBox).mockClear()
    vi.mocked(bridge.createDynamicSphere).mockClear()
    vi.mocked(bridge.bodyDestroy).mockClear()
    return { world, bridge }
}

const CUBES_ONLY = { cubeCount: 20, cubeScale: 3.5, columnCount: 0, columnSize: 1.5, columnHeight: 6 }

describe('Feature E — launch ramps', () => {
    it('converts nothing and draws no bodies when rampCubeRatio is absent (backward compatible)', () => {
        const { world, bridge } = makeWorld()
        const sim = new MarbleSim(world, { enemySize: 0.9, enemyMass: 2.5, seed: 7, obstacles: CUBES_ONLY })

        expect(sim.rampFlags.every(f => f === false)).toBe(true)
        // 1 flat floor + cubeCount cubes, nothing else (no ramp steps added).
        expect(bridge.createStaticBox).toHaveBeenCalledTimes(1 + CUBES_ONLY.cubeCount)
    })

    it('rampCubeRatio:0 produces a cube layout byte-identical to the no-ramp run (determinism)', () => {
        const noRamp = new MarbleSim(makeWorld().world, { enemySize: 0.9, enemyMass: 2.5, seed: 99, obstacles: CUBES_ONLY })
        const zeroRamp = new MarbleSim(makeWorld().world, { enemySize: 0.9, enemyMass: 2.5, seed: 99, obstacles: { ...CUBES_ONLY, rampCubeRatio: 0 } })
        noRamp.cubePositions.forEach((p, i) => {
            expect(zeroRamp.cubePositions[i].x).toBe(p.x)
            expect(zeroRamp.cubePositions[i].z).toBe(p.z)
        })
        expect(zeroRamp.rampFlags.every(f => f === false)).toBe(true)
    })

    it('rampCubeRatio:1 turns every cube into a ramp — old box destroyed, stepped boxes built', () => {
        // Baseline: an identical no-ramp build, to isolate the ramp-pass deltas from the
        // world-reset scaffolding (MarbleSim resets the world, destroying the smoke bodies).
        const base = makeWorld()
        new MarbleSim(base.world, { enemySize: 0.9, enemyMass: 2.5, seed: 3, obstacles: CUBES_ONLY })
        const baseDestroys = vi.mocked(base.bridge.bodyDestroy).mock.calls.length
        const baseBoxes = vi.mocked(base.bridge.createStaticBox).mock.calls.length

        const { world, bridge } = makeWorld()
        const sim = new MarbleSim(world, { enemySize: 0.9, enemyMass: 2.5, seed: 3, obstacles: { ...CUBES_ONLY, rampCubeRatio: 1 } })

        expect(sim.rampFlags.every(f => f === true)).toBe(true)
        expect(sim.rampFacings.every(f => f >= 0 && f <= 3)).toBe(true)
        // Delta over baseline: every cube body destroyed once (converted).
        expect(vi.mocked(bridge.bodyDestroy).mock.calls.length).toBe(baseDestroys + CUBES_ONLY.cubeCount)
        // Delta over baseline: cubeCount × RAMP.steps extra stepped boxes.
        expect(vi.mocked(bridge.createStaticBox).mock.calls.length).toBe(baseBoxes + CUBES_ONLY.cubeCount * RAMP.steps)
    })

    it('is seed-deterministic: same seed ⇒ identical ramp set + facings; ~ratio share converted', () => {
        const build = (seed: number) => new MarbleSim(makeWorld().world, { enemySize: 0.9, enemyMass: 2.5, seed, obstacles: { ...CUBES_ONLY, rampCubeRatio: 0.5 } })
        const a = build(21)
        const b = build(21)
        const c = build(2024)

        expect(a.rampFlags).toEqual(b.rampFlags)
        expect(a.rampFacings).toEqual(b.rampFacings)
        // Different seed ⇒ generally a different ramp set.
        expect(a.rampFlags).not.toEqual(c.rampFlags)
        // ~half converted (loose bounds — seeded, 20 cubes).
        const ramps = a.rampFlags.filter(Boolean).length
        expect(ramps).toBeGreaterThan(3)
        expect(ramps).toBeLessThan(17)
    })

    it('exposes physics-authoritative ramp dims for the renderer (anti-drift)', () => {
        const sim = new MarbleSim(makeWorld().world, { enemySize: 0.9, enemyMass: 2.5, seed: 1, obstacles: { ...CUBES_ONLY, rampCubeRatio: 0.5 } })
        expect(sim.rampSize).toBe(CUBES_ONLY.cubeScale)
        expect(sim.rampRise).toBe(RAMP.rise)
    })
})

describe('AI legibility overlay — enemyDebug exposure', () => {
    it('exposes an inactive debug snapshot at construction with the vision distance', () => {
        const sim = new MarbleSim(makeWorld().world, { enemySize: 0.9, enemyMass: 2.5, seed: 1 })
        expect(sim.enemyDebug.active).toBe(false)
        expect(sim.enemyDebug.visionDistance).toBe(ENEMY.visionDistance)
        expect(sim.enemyDebug.waypoints).toHaveLength(4)
    })
})
