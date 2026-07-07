/**
 * Box3D headless integration tests — feel invariants run against the REAL
 * gameplay simulation (systems/sim/MarbleSim), not a parallel re-implementation.
 *
 * Loads the actual compiled WASM bridge in Node, so these tests exercise the
 * exact code path the game ships: MarbleSim.step() at FIXED_DT.
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { Box3DWorld } from './Box3DWorld'
import { loadBox3DBridge, loadBox3DBridgeModule } from './box3dBridge'
import { useGameStore } from '../../store/useGameStore'
import { MarbleSim, type SimInput } from '../../systems/sim/MarbleSim'
import { FIXED_DT } from '../../systems/sim/tuning'
// @ts-expect-error - compiled JS module doesn't have TS declarations
import createMarbleBox3DBridgeModule from '../../../public/box3d/box3d_bridge.js'

// Setup Node-compatible environment for Emscripten WASM loading
const wasmPath = path.resolve(process.cwd(), 'public/box3d/box3d_bridge.wasm')
const wasmBuffer = fs.readFileSync(wasmPath)

const manifest = {
    version: '0.1.0',
    moduleUrl: '/box3d/box3d_bridge.js',
    wasmUrl: '/box3d/box3d_bridge.wasm',
}

// Mock fetch to intercept the manifest and WASM binary requests
const mockFetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('bridge-manifest.json')) {
        return {
            ok: true,
            status: 200,
            async text() {
                return JSON.stringify(manifest)
            }
        }
    }
    if (url.endsWith('box3d_bridge.wasm')) {
        return {
            ok: true,
            status: 200,
            async arrayBuffer() {
                return wasmBuffer.buffer.slice(
                    wasmBuffer.byteOffset,
                    wasmBuffer.byteOffset + wasmBuffer.byteLength
                )
            }
        }
    }
    return {
        ok: false,
        status: 404,
        async text() {
            return 'Not found'
        }
    }
})

globalThis.fetch = mockFetch as any

// Emscripten bridge script expects window and factory function
const globalObj = globalThis as any
globalObj.window = globalThis
globalObj.createMarbleBox3DBridgeModule = createMarbleBox3DBridgeModule

const NO_INPUT: SimInput = { w: false, a: false, s: false, d: false, space: false, shift: false }

async function bootWorld(): Promise<Box3DWorld> {
    const status = await loadBox3DBridge()
    expect(status.available).toBe(true)
    const bridge = await loadBox3DBridgeModule()
    expect(bridge.health()).toBe(1)
    const world = new Box3DWorld(bridge)
    world.reset()
    return world
}

function makeSim(world: Box3DWorld, events?: { onTag?: () => void }): MarbleSim {
    const settings = useGameStore.getState()
    return new MarbleSim(world, {
        // No heights → flat slab environment (F1's original measurement surface)
        enemySize: settings.enemySize,
        enemyMass: settings.enemyMass,
        playerSpawn: { x: 0, y: 1.0, z: 0 },
        enemySpawn: { x: 0, y: 0.5 + settings.enemySize, z: -20 },
        events
    })
}

describe('Box3D Headless Physical Integration (Feel Invariants, real MarbleSim)', () => {
    it('F1: Enemy in chase catches a stationary player from 20u in < 8s at default tuning', async () => {
        const world = await bootWorld()

        let caught = false
        let catchTime = 0
        const sim = makeSim(world, { onTag: () => { caught = true } })

        const settings = useGameStore.getState()
        const params = { enemySpeed: settings.enemySpeed, enemyAirControl: settings.enemyAirControl }

        const maxTime = 8.0 // F1 limit
        let elapsed = 0
        while (elapsed < maxTime && !caught) {
            sim.step(FIXED_DT, NO_INPUT, params)
            elapsed += FIXED_DT
            if (caught) catchTime = elapsed
        }

        console.log(`F1 complete. AI state: ${sim.currentAIState}, caught: ${caught}, time: ${catchTime.toFixed(3)}s`)
        expect(caught).toBe(true)
        expect(catchTime).toBeLessThan(maxTime)
        expect(sim.tagged).toBe(true)

        world.destroy()
    })

    it('F9: identical inputs produce bit-identical trajectories (fixed-step physics determinism)', async () => {
        // Scripted input: hold W for 2s, then release, over 5 sim-seconds total.
        // Stays in alert/chase (LOS never breaks on the flat slab), so the one
        // remaining Math.random() source (search waypoints) never fires.
        const script = (stepIndex: number): SimInput => ({
            w: stepIndex < 120,
            a: false,
            s: false,
            d: false,
            space: stepIndex === 150, // one jump
            shift: stepIndex >= 240
        })

        const settings = useGameStore.getState()
        const params = { enemySpeed: settings.enemySpeed, enemyAirControl: settings.enemyAirControl }
        const steps = 300

        async function run(): Promise<number[]> {
            const world = await bootWorld()
            const sim = makeSim(world)
            for (let i = 0; i < steps; i++) {
                sim.step(FIXED_DT, script(i), params)
            }
            const out = [
                sim.playerCurr.position.x, sim.playerCurr.position.y, sim.playerCurr.position.z,
                sim.enemyCurr.position.x, sim.enemyCurr.position.y, sim.enemyCurr.position.z
            ]
            world.destroy()
            return out
        }

        const a = await run()
        const b = await run()

        for (let i = 0; i < a.length; i++) {
            expect(b[i]).toBe(a[i]) // exact — same WASM ops, same order, same dt
        }
        // Sanity: the run actually moved things (not comparing frozen zeros)
        expect(Math.abs(a[2]) + Math.abs(a[5])).toBeGreaterThan(0.01)
    })

    it('resetPositions restores spawn state and clears the tag flag', async () => {
        const world = await bootWorld()
        const sim = makeSim(world)
        const settings = useGameStore.getState()
        const params = { enemySpeed: settings.enemySpeed, enemyAirControl: settings.enemyAirControl }

        for (let i = 0; i < 240; i++) sim.step(FIXED_DT, NO_INPUT, params)
        expect(sim.enemyCurr.position.distanceTo(sim.playerCurr.position)).toBeLessThan(20)

        sim.resetPositions()
        expect(sim.tagged).toBe(false)
        expect(sim.currentAIState).toBe('idle')
        expect(sim.playerCurr.position.y).toBeCloseTo(1.0, 3)
        expect(sim.enemyCurr.position.z).toBeCloseTo(-20, 3)

        world.destroy()
    })
})
