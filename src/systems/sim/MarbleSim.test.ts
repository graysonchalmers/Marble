/**
 * Unit tests for MarbleSim's static obstacle scatter (Gate 1: cubes, Gate 2: columns).
 *
 * Uses a lightweight mocked bridge (same pattern as Box3DWorld.test.ts) — no real
 * WASM needed, since Box3DWorld/MarbleSim construction is plain TS logic over the
 * bridge call surface. Fast, headless, and isolates the new scatter/placement code
 * from full gameplay physics.
 */
import { describe, it, expect, vi } from 'vitest'
import { Box3DWorld } from '../../physics/box3d/Box3DWorld'
import type { MarbleBox3DBridgeExports } from '../../physics/box3d/box3dBridge'
import { MarbleSim } from './MarbleSim'
import { OBSTACLES, PROPS, CRUMBLE } from './tuning'
import { getTerrainHeight } from '../../utils/terrain'

function makeBridge(): MarbleBox3DBridgeExports {
    const heap = new Float32Array(1024)
    let nextPtr = 8
    let nextBodyId = 100

    return {
        manifest: { version: '0.1.0', moduleUrl: '', wasmUrl: '' },
        module: {
            HEAPF32: heap,
            _malloc: vi.fn((size: number) => {
                const ptr = nextPtr
                nextPtr += size
                return ptr
            }),
            _free: vi.fn(),
            cwrap: vi.fn()
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
        readBodyTransform: vi.fn((_bodyPtr: number, outPtr: number) => {
            const offset = outPtr / Float32Array.BYTES_PER_ELEMENT
            heap[offset] = 0
            heap[offset + 1] = 0
            heap[offset + 2] = 0
            heap[offset + 3] = 0
            heap[offset + 4] = 0
            heap[offset + 5] = 0
            heap[offset + 6] = 1
            return 1
        }),
        worldRaycast: vi.fn(() => 1)
    } satisfies MarbleBox3DBridgeExports
}

function makeWorld() {
    const bridge = makeBridge()
    // Box3DWorld's constructor already calls reset() once (smoke-test scaffold:
    // one static floor + one dynamic sphere). Clear those specific spies
    // afterward so downstream assertions only count calls made by the
    // MarbleSim construction under test, decoupled from that scaffolding.
    const world = new Box3DWorld(bridge)
    vi.mocked(bridge.createStaticBox).mockClear()
    vi.mocked(bridge.createDynamicSphere).mockClear()
    return { world, bridge }
}

describe('MarbleSim static obstacle scatter', () => {
    it('places no obstacles when the config is omitted (backward compatible)', () => {
        const { world } = makeWorld()
        const sim = new MarbleSim(world, { enemySize: 0.9, enemyMass: 2.5 })

        expect(sim.cubePositions).toHaveLength(0)
        expect(sim.columnPositions).toHaveLength(0)
    })

    it('scatters the requested number of cubes and columns, all outside the clear radius', () => {
        const { world, bridge } = makeWorld()
        const cubeCount = 25
        const columnCount = 10

        const sim = new MarbleSim(world, {
            enemySize: 0.9,
            enemyMass: 2.5,
            obstacles: { cubeCount, cubeScale: 7, columnCount, columnSize: 2, columnHeight: 14 }
        })

        expect(sim.cubePositions).toHaveLength(cubeCount)
        expect(sim.columnPositions).toHaveLength(columnCount)

        const clearRadiusSq = OBSTACLES.clearRadius * OBSTACLES.clearRadius
        for (const pos of [...sim.cubePositions, ...sim.columnPositions]) {
            expect(pos.x * pos.x + pos.z * pos.z).toBeGreaterThanOrEqual(clearRadiusSq)
        }

        // 1 flat-slab static floor (no heights passed) + cubeCount + columnCount static boxes.
        expect(bridge.createStaticBox).toHaveBeenCalledTimes(1 + cubeCount + columnCount)
    })

    it('rests cube/column centers exactly half-height above the analytic terrain at their (x, z)', () => {
        const { world } = makeWorld()
        const cubeScale = 7
        const columnHeight = 14
        const sim = new MarbleSim(world, {
            enemySize: 0.9,
            enemyMass: 2.5,
            obstacles: { cubeCount: 5, cubeScale, columnCount: 3, columnSize: 2, columnHeight }
        })

        // Exact contract: y = terrainHeight(x, z) + half-height − sink. Intentionally sunk into
        // the ground by OBSTACLES.sink so the base is buried (s24) — coherent for collider+visual.
        for (const pos of sim.cubePositions) {
            expect(pos.y).toBeCloseTo(getTerrainHeight(pos.x, pos.z) + cubeScale / 2 - OBSTACLES.sink, 5)
        }
        for (const pos of sim.columnPositions) {
            expect(pos.y).toBeCloseTo(getTerrainHeight(pos.x, pos.z) + columnHeight / 2 - OBSTACLES.sink, 5)
        }
    })

    it('exposes physics-authoritative cube/column dims for the renderer (anti-drift)', () => {
        const { world } = makeWorld()
        const sim = new MarbleSim(world, {
            enemySize: 0.9,
            enemyMass: 2.5,
            obstacles: { cubeCount: 3, cubeScale: 7, columnCount: 3, columnSize: 3, columnHeight: 12 }
        })

        // Render must read these off the sim (built at construction), never the live store,
        // so the visual mesh can't drift from the static colliders.
        expect(sim.cubeScale).toBe(7)
        expect(sim.columnSize).toBe(3)
        expect(sim.columnHeight).toBe(12)
    })

    it('produces identical layouts for identical seeds, different layouts for different seeds (F9)', () => {
        const obstacles = { cubeCount: 12, cubeScale: 7, columnCount: 4, columnSize: 2, columnHeight: 14 }
        const build = (seed: number) =>
            new MarbleSim(makeWorld().world, { enemySize: 0.9, enemyMass: 2.5, seed, obstacles })

        const a = build(42)
        const b = build(42)
        const c = build(1337)

        expect(a.seed).toBe(42)
        // Same seed ⇒ bit-identical scatter across two fresh sims.
        a.cubePositions.forEach((pos, i) => {
            expect(pos.x).toBe(b.cubePositions[i].x)
            expect(pos.z).toBe(b.cubePositions[i].z)
        })
        a.columnPositions.forEach((pos, i) => {
            expect(pos.x).toBe(b.columnPositions[i].x)
            expect(pos.z).toBe(b.columnPositions[i].z)
        })
        // Different seed ⇒ different layout (first cube suffices).
        expect(
            a.cubePositions[0].x !== c.cubePositions[0].x ||
            a.cubePositions[0].z !== c.cubePositions[0].z
        ).toBe(true)
    })
})

describe('MarbleSim scattered props (Phase P, Feature A)', () => {
    const baseObstacles = { cubeCount: 0, cubeScale: 7, columnCount: 0, columnSize: 3, columnHeight: 12 }

    it('spawns no props when propCount is omitted (backward compatible)', () => {
        const { world, bridge } = makeWorld()
        const sim = new MarbleSim(world, { enemySize: 0.9, enemyMass: 2.5 })
        expect(sim.propCount).toBe(0)
        expect(sim.propRadii).toHaveLength(0)
        expect(sim.propSpawns).toHaveLength(0)
        // Only the player + enemy dynamic spheres — no props.
        expect(bridge.createDynamicSphere).toHaveBeenCalledTimes(2)
    })

    it('spawns propCount dynamic spheres (player + enemy + props), all outside the clear radius', () => {
        const { world, bridge } = makeWorld()
        const propCount = 14
        const sim = new MarbleSim(world, {
            enemySize: 0.9,
            enemyMass: 2.5,
            obstacles: { ...baseObstacles, propCount },
        })

        expect(sim.propCount).toBe(propCount)
        expect(sim.propRadii).toHaveLength(propCount)
        expect(sim.propSpawns).toHaveLength(propCount)
        expect(sim.propPrev).toHaveLength(propCount)
        expect(sim.propCurr).toHaveLength(propCount)

        // player(1) + enemy(1) + propCount dynamic spheres.
        expect(bridge.createDynamicSphere).toHaveBeenCalledTimes(2 + propCount)

        const clearSq = OBSTACLES.clearRadius * OBSTACLES.clearRadius
        for (const s of sim.propSpawns) {
            expect(s.x * s.x + s.z * s.z).toBeGreaterThanOrEqual(clearSq)
        }
        for (const r of sim.propRadii) {
            expect(r).toBeGreaterThanOrEqual(PROPS.minRadius)
            expect(r).toBeLessThanOrEqual(PROPS.maxRadius)
        }
    })

    it('drops each prop above the terrain (spawn y = terrainHeight + radius + dropHeight)', () => {
        const { world } = makeWorld()
        const sim = new MarbleSim(world, {
            enemySize: 0.9,
            enemyMass: 2.5,
            obstacles: { ...baseObstacles, propCount: 8 },
        })
        sim.propSpawns.forEach((s, i) => {
            expect(s.y).toBeCloseTo(getTerrainHeight(s.x, s.z) + sim.propRadii[i] + PROPS.dropHeight, 5)
        })
    })

    it('is seed-deterministic: same seed → identical props, different seed → different (F9)', () => {
        const obstacles = { ...baseObstacles, propCount: 12 }
        const build = (seed: number) =>
            new MarbleSim(makeWorld().world, { enemySize: 0.9, enemyMass: 2.5, seed, obstacles })

        const a = build(42)
        const b = build(42)
        const c = build(1337)

        a.propSpawns.forEach((s, i) => {
            expect(s.x).toBe(b.propSpawns[i].x)
            expect(s.z).toBe(b.propSpawns[i].z)
            expect(a.propRadii[i]).toBe(b.propRadii[i])
        })
        expect(
            a.propSpawns[0].x !== c.propSpawns[0].x ||
            a.propSpawns[0].z !== c.propSpawns[0].z ||
            a.propRadii[0] !== c.propRadii[0]
        ).toBe(true)
    })
})

describe('MarbleSim crumble blocks (Phase P, Feature C)', () => {
    const baseObstacles = { cubeCount: 0, cubeScale: 7, columnCount: 0, columnSize: 3, columnHeight: 12 }

    it('creates no crumble blocks when crumbleCount is omitted (backward compatible)', () => {
        const { world, bridge } = makeWorld()
        const sim = new MarbleSim(world, { enemySize: 0.9, enemyMass: 2.5 })
        expect(sim.crumbleCount).toBe(0)
        expect(sim.crumblePositions).toHaveLength(0)
        expect(sim.crumbleAlive).toHaveLength(0)
        expect(sim.debrisActiveCount).toBe(0)
        // Only the flat-slab floor static box — no crumble blocks.
        expect(bridge.createStaticBox).toHaveBeenCalledTimes(1)
    })

    it('scatters crumbleCount static blocks, all alive + outside the clear radius, dims exposed', () => {
        const { world, bridge } = makeWorld()
        const crumbleCount = 6
        const sim = new MarbleSim(world, {
            enemySize: 0.9,
            enemyMass: 2.5,
            obstacles: { ...baseObstacles, crumbleCount },
        })

        expect(sim.crumbleCount).toBe(crumbleCount)
        expect(sim.crumblePositions).toHaveLength(crumbleCount)
        expect(sim.crumbleQuaternions).toHaveLength(crumbleCount)
        expect(sim.crumbleAlive).toHaveLength(crumbleCount)
        expect(sim.crumbleAlive.every(a => a === true)).toBe(true)
        expect(sim.crumbleScale).toBe(CRUMBLE.scale)
        expect(sim.debrisActiveCount).toBe(0)

        // 1 flat-slab floor + crumbleCount crumble blocks (no cubes/columns here).
        expect(bridge.createStaticBox).toHaveBeenCalledTimes(1 + crumbleCount)

        const clearSq = OBSTACLES.clearRadius * OBSTACLES.clearRadius
        for (const p of sim.crumblePositions) {
            expect(p.x * p.x + p.z * p.z).toBeGreaterThanOrEqual(clearSq)
        }
    })

    it('rests each crumble block half-height above the analytic terrain', () => {
        const { world } = makeWorld()
        const sim = new MarbleSim(world, {
            enemySize: 0.9,
            enemyMass: 2.5,
            obstacles: { ...baseObstacles, crumbleCount: 5 },
        })
        for (const p of sim.crumblePositions) {
            expect(p.y).toBeCloseTo(getTerrainHeight(p.x, p.z) + CRUMBLE.scale / 2 - OBSTACLES.sink, 5)
        }
    })

    it('is seed-deterministic: same seed → identical block layout, different seed → different (F9)', () => {
        const obstacles = { ...baseObstacles, crumbleCount: 8 }
        const build = (seed: number) =>
            new MarbleSim(makeWorld().world, { enemySize: 0.9, enemyMass: 2.5, seed, obstacles })

        const a = build(42)
        const b = build(42)
        const c = build(1337)

        a.crumblePositions.forEach((p, i) => {
            expect(p.x).toBe(b.crumblePositions[i].x)
            expect(p.z).toBe(b.crumblePositions[i].z)
        })
        expect(
            a.crumblePositions[0].x !== c.crumblePositions[0].x ||
            a.crumblePositions[0].z !== c.crumblePositions[0].z
        ).toBe(true)
    })

    it('adding crumble blocks does NOT shift prop determinism (crumble is drawn last)', () => {
        // Props are drawn before crumble from the same seeded stream, so a run that also has
        // crumble blocks must produce byte-identical props to a run without them (proves the
        // additive-safety property that keeps every existing prop/F9 test valid).
        const seed = 777
        const withoutCrumble = new MarbleSim(makeWorld().world, {
            enemySize: 0.9, enemyMass: 2.5, seed,
            obstacles: { ...baseObstacles, propCount: 10 },
        })
        const withCrumble = new MarbleSim(makeWorld().world, {
            enemySize: 0.9, enemyMass: 2.5, seed,
            obstacles: { ...baseObstacles, propCount: 10, crumbleCount: 6 },
        })
        withoutCrumble.propSpawns.forEach((s, i) => {
            expect(withCrumble.propSpawns[i].x).toBe(s.x)
            expect(withCrumble.propSpawns[i].z).toBe(s.z)
            expect(withCrumble.propRadii[i]).toBe(withoutCrumble.propRadii[i])
        })
    })
})
