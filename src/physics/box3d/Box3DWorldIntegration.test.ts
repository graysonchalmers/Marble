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
import { FIXED_DT, CRUMBLE } from '../../systems/sim/tuning'
import { ReplayRecorder } from '../../systems/replay/recorder'
import { ReplayPlayer } from '../../systems/replay/player'
import { REPLAY_VERSION } from '../../systems/replay/types'
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

    it('Replay: recording a scripted run and replaying it reproduces a bit-identical trajectory', async () => {
        // Varied scripted input so the recorder captures changing frames, not a constant.
        const script = (i: number): SimInput => ({
            w: i < 140,
            a: i >= 60 && i < 90,
            s: false,
            d: i >= 90 && i < 140,
            space: i === 150,
            shift: i >= 240,
        })
        const settings = useGameStore.getState()
        const params = { enemySpeed: settings.enemySpeed, enemyAirControl: settings.enemyAirControl }
        const steps = 300
        const seed = 0xbeef

        function makeSeededSim(world: Box3DWorld): MarbleSim {
            return new MarbleSim(world, {
                enemySize: settings.enemySize,
                enemyMass: settings.enemyMass,
                playerSpawn: { x: 0, y: 1.0, z: 0 },
                enemySpawn: { x: 0, y: 0.5 + settings.enemySize, z: -20 },
                seed,
            })
        }

        // --- LIVE run: drive the sim with the script AND record every tick ---
        const world1 = await bootWorld()
        const sim1 = makeSeededSim(world1)
        const rec = new ReplayRecorder()
        rec.start({
            version: REPLAY_VERSION,
            seed,
            fixedDt: FIXED_DT,
            enemySize: settings.enemySize,
            enemyMass: settings.enemyMass,
            playerSpawn: { x: 0, y: 1.0, z: 0 },
            enemySpawn: { x: 0, y: 0.5 + settings.enemySize, z: -20 },
            gravityY: -9.81,
        })
        for (let i = 0; i < steps; i++) {
            const input = script(i)
            rec.capture(input, params)
            sim1.step(FIXED_DT, input, params)
        }
        const live = [
            sim1.playerCurr.position.x, sim1.playerCurr.position.y, sim1.playerCurr.position.z,
            sim1.enemyCurr.position.x, sim1.enemyCurr.position.y, sim1.enemyCurr.position.z,
        ]
        const replay = rec.stop()
        world1.destroy()

        expect(replay).not.toBeNull()
        expect(replay!.frames.length).toBe(steps)
        expect(replay!.header.seed).toBe(seed)

        // --- REPLAY run: rebuild a fresh sim from the header, feed the recorded stream ---
        const world2 = await bootWorld()
        const sim2 = new MarbleSim(world2, {
            enemySize: replay!.header.enemySize,
            enemyMass: replay!.header.enemyMass,
            playerSpawn: replay!.header.playerSpawn,
            enemySpawn: replay!.header.enemySpawn,
            seed: replay!.header.seed,
        })
        const playerCursor = new ReplayPlayer(replay!)
        let frame
        while ((frame = playerCursor.next()) !== null) {
            sim2.step(replay!.header.fixedDt, frame.input, frame.params)
        }
        const played = [
            sim2.playerCurr.position.x, sim2.playerCurr.position.y, sim2.playerCurr.position.z,
            sim2.enemyCurr.position.x, sim2.enemyCurr.position.y, sim2.enemyCurr.position.z,
        ]
        world2.destroy()

        // Bit-identical: the replay reproduced the exact match.
        expect(playerCursor.done).toBe(true)
        expect(played).toEqual(live)
        expect(Math.abs(live[2]) + Math.abs(live[5])).toBeGreaterThan(0.01) // actually moved
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

describe('Box3D Feature C crumble/smash (real MarbleSim + WASM)', () => {
    const CRUMBLE_OBSTACLES = { cubeCount: 0, cubeScale: 7, columnCount: 0, columnSize: 3, columnHeight: 12, crumbleCount: 1 }

    function makeCrumbleSim(world: Box3DWorld, seed = 123): MarbleSim {
        const settings = useGameStore.getState()
        return new MarbleSim(world, {
            enemySize: settings.enemySize,
            enemyMass: settings.enemyMass,
            playerSpawn: { x: 0, y: 1.0, z: 0 },
            enemySpawn: { x: 0, y: 0.5 + settings.enemySize, z: -20 },
            obstacles: CRUMBLE_OBSTACLES,
            seed,
        })
    }

    it('a fast hitter in contact smashes a crumble block into debrisPerBlock debris', async () => {
        const world = await bootWorld()
        const sim = makeCrumbleSim(world)
        // Isolate the player smash: freeze the enemy so only the player can trigger it.
        const params = { enemySpeed: 2, enemyAirControl: 0, freezeEnemy: true }

        expect(sim.crumbleCount).toBe(1)
        expect(sim.crumbleAlive[0]).toBe(true)
        expect(sim.debrisActiveCount).toBe(0)

        // Put the player on the block, moving well over the smash-speed threshold.
        const c = sim.crumblePositions[0]
        world.bodySetTransform(sim.playerBodyPtr, c.x, c.y, c.z, 0, 0, 0, 1)
        world.setLinearVelocity(sim.playerBodyPtr, CRUMBLE.smashSpeed + 6, 0, 0)

        sim.step(FIXED_DT, NO_INPUT, params)

        expect(sim.crumbleAlive[0]).toBe(false)
        expect(sim.debrisActiveCount).toBe(CRUMBLE.debrisPerBlock)

        world.destroy()
    })

    it('a slow touch does NOT smash the block (needs real momentum)', async () => {
        const world = await bootWorld()
        const sim = makeCrumbleSim(world)
        const params = { enemySpeed: 2, enemyAirControl: 0, freezeEnemy: true }

        const c = sim.crumblePositions[0]
        world.bodySetTransform(sim.playerBodyPtr, c.x, c.y, c.z, 0, 0, 0, 1)
        world.setLinearVelocity(sim.playerBodyPtr, CRUMBLE.smashSpeed - 5, 0, 0) // below threshold

        sim.step(FIXED_DT, NO_INPUT, params)

        expect(sim.crumbleAlive[0]).toBe(true)
        expect(sim.debrisActiveCount).toBe(0)

        world.destroy()
    })

    it('the smash + debris are seed-deterministic (F9-safe): identical debris trajectories', async () => {
        const params = { enemySpeed: 2, enemyAirControl: 0, freezeEnemy: true }

        async function run(): Promise<number[]> {
            const world = await bootWorld()
            const sim = makeCrumbleSim(world, 0xc0ffee)
            const c = sim.crumblePositions[0]
            world.bodySetTransform(sim.playerBodyPtr, c.x, c.y, c.z, 0, 0, 0, 1)
            world.setLinearVelocity(sim.playerBodyPtr, CRUMBLE.smashSpeed + 6, 0, 0)
            // Smash, then let the debris fly + settle a bit.
            for (let i = 0; i < 30; i++) sim.step(FIXED_DT, NO_INPUT, params)
            const out: number[] = []
            for (let i = 0; i < sim.debrisActiveCount; i++) {
                out.push(sim.debrisCurr[i].position.x, sim.debrisCurr[i].position.y, sim.debrisCurr[i].position.z)
            }
            world.destroy()
            return out
        }

        const a = await run()
        const b = await run()
        expect(a.length).toBeGreaterThan(0)
        expect(b).toEqual(a) // bit-identical burst + physics
    })

    it('a dynamic box is physical: falls under gravity and settles on the floor', async () => {
        const world = await bootWorld()
        world.clearBodies()
        // Floor at y=0 (top), a 0.5-half-extent box dropped from y=6.
        world.createStaticBox(0, -0.5, 0, 50, 0.5, 50, 0.6, 0.2)
        const box = world.createDynamicBox(0, 6, 0, 0.5, 0.5, 0.5, 1.0, 0.6, 0.2)
        world.setDamping(box, 0.05, 0.05)

        const y0 = world.readBodyTransform(box).position.y
        for (let i = 0; i < 240; i++) world.step(FIXED_DT) // 4s
        const yRest = world.readBodyTransform(box).position.y

        expect(y0).toBeCloseTo(6, 1)                 // started high
        expect(yRest).toBeLessThan(y0)               // fell
        expect(yRest).toBeGreaterThan(0.3)           // rests ON the floor (~half-extent 0.5), not through it
        expect(yRest).toBeLessThan(1.0)
        world.destroy()
    })

    it('resetPositions reforms the block and clears all debris', async () => {
        const world = await bootWorld()
        const sim = makeCrumbleSim(world)
        const params = { enemySpeed: 2, enemyAirControl: 0, freezeEnemy: true }

        const c = sim.crumblePositions[0]
        world.bodySetTransform(sim.playerBodyPtr, c.x, c.y, c.z, 0, 0, 0, 1)
        world.setLinearVelocity(sim.playerBodyPtr, CRUMBLE.smashSpeed + 6, 0, 0)
        sim.step(FIXED_DT, NO_INPUT, params)
        expect(sim.crumbleAlive[0]).toBe(false)
        expect(sim.debrisActiveCount).toBe(CRUMBLE.debrisPerBlock)

        sim.resetPositions()
        expect(sim.crumbleAlive[0]).toBe(true)
        expect(sim.debrisActiveCount).toBe(0)

        world.destroy()
    })
})
