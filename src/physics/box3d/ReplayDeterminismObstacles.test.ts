/**
 * Replay determinism — the OBSTACLE + TERRAIN path (real WASM).
 *
 * The existing "bit-identical trajectory" replay test runs on a bare arena (no obstacles, no
 * heightfield). This one closes that gap: it records a scripted run through the FULL live-game
 * clutter — heightfield terrain (via setTerrainRoughness), cubes, columns, props, crumble blocks,
 * and Feature E launch pyramids (rampCubeRatio:1) — then rebuilds a fresh sim purely from the
 * recorded header and replays the captured input stream. The two trajectories must be
 * BIT-IDENTICAL for the whole run.
 *
 * Why it matters: if any config the sim consumes (seed, obstacle counts, terrain roughness, the
 * per-tick RNG stream the enemy AI draws from) is not faithfully carried by the replay header,
 * record and replay diverge — the replayed ball collides where the live one didn't ("phantom
 * side-hits", multi-tag). This test is the guard that the whole record→replay boundary stays
 * deterministic through obstacle/terrain/AI changes.
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { Box3DWorld } from './Box3DWorld'
import { loadBox3DBridge, loadBox3DBridgeModule } from './box3dBridge'
import { useGameStore } from '../../store/useGameStore'
import { MarbleSim, type SimInput, type ObstacleConfig } from '../../systems/sim/MarbleSim'
import { FIXED_DT } from '../../systems/sim/tuning'
import { ReplayRecorder } from '../../systems/replay/recorder'
import { ReplayPlayer } from '../../systems/replay/player'
import { REPLAY_VERSION } from '../../systems/replay/types'
import { generateTerrainHeights, setTerrainRoughness } from '../../utils/terrain'
// @ts-expect-error - compiled JS module doesn't have TS declarations
import createMarbleBox3DBridgeModule from '../../../public/box3d/box3d_bridge.js'

const wasmPath = path.resolve(process.cwd(), 'public/box3d/box3d_bridge.wasm')
const wasmBuffer = fs.readFileSync(wasmPath)
const manifest = { version: '0.1.0', moduleUrl: '/box3d/box3d_bridge.js', wasmUrl: '/box3d/box3d_bridge.wasm' }
const mockFetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('bridge-manifest.json')) return { ok: true, status: 200, async text() { return JSON.stringify(manifest) } }
    if (url.endsWith('box3d_bridge.wasm')) return { ok: true, status: 200, async arrayBuffer() { return wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength) } }
    return { ok: false, status: 404, async text() { return 'Not found' } }
})
const g = globalThis as any
g.fetch = mockFetch
g.window = globalThis
g.createMarbleBox3DBridgeModule = createMarbleBox3DBridgeModule

async function bootWorld(): Promise<Box3DWorld> {
    await loadBox3DBridge()
    const bridge = await loadBox3DBridgeModule()
    return new Box3DWorld(bridge)
}

const OBST: ObstacleConfig = {
    cubeCount: 30, cubeScale: 3.5, columnCount: 6, columnSize: 1.5, columnHeight: 6,
    propCount: 24, crumbleCount: 12, columnsCrumble: true, rampCubeRatio: 1.0,
}

function traj(sim: MarbleSim): number[] {
    return [
        sim.playerCurr.position.x, sim.playerCurr.position.y, sim.playerCurr.position.z,
        sim.enemyCurr.position.x, sim.enemyCurr.position.y, sim.enemyCurr.position.z,
    ]
}

describe('Replay determinism — obstacles + terrain + pyramids (real WASM)', () => {
    it('replays a full-clutter scripted run bit-identically', async () => {
        const s = useGameStore.getState()
        const params = { enemySpeed: s.enemySpeed, enemyAirControl: s.enemyAirControl }
        const seed = 0xbeef
        const steps = 400
        const roughness = s.terrainRoughness

        // Scripted input that drives the ball around so it grazes obstacles and the enemy closes in.
        const script = (i: number): SimInput => ({
            w: i < 220, a: i >= 60 && i < 120, s: i >= 300 && i < 340,
            d: i >= 120 && i < 200, space: i === 90 || i === 210, shift: i >= 250,
        })

        // --- LIVE: terrain roughness → heights → sim with obstacles; record every tick ---
        setTerrainRoughness(roughness)
        const heights1 = generateTerrainHeights()
        const world1 = await bootWorld()
        world1.reset(-22.5)
        const sim1 = new MarbleSim(world1, { heights: heights1, enemySize: s.enemySize, enemyMass: s.enemyMass, seed, obstacles: OBST })
        const rec = new ReplayRecorder()
        rec.start({
            version: REPLAY_VERSION, seed, fixedDt: FIXED_DT, enemySize: s.enemySize, enemyMass: s.enemyMass,
            gravityY: -22.5, obstacles: OBST, terrainRoughness: roughness,
        })
        const liveTraj: number[][] = []
        for (let i = 0; i < steps; i++) {
            const input = script(i)
            rec.capture(input, params)
            sim1.step(FIXED_DT, input, params)
            liveTraj.push(traj(sim1))
        }
        const replay = rec.stop()!
        world1.destroy()

        // Sanity: the run must actually exercise the hard paths, or "bit-identical" is vacuous.
        expect(replay.frames.length).toBe(steps)
        expect(sim1.rampFlags.filter(Boolean).length).toBeGreaterThan(0) // pyramids present
        expect(sim1.tagged).toBe(true)                                   // enemy AI ran a full chase→tag

        // --- REPLAY: rebuild a fresh sim purely from the header, feed the recorded stream ---
        setTerrainRoughness(replay.header.terrainRoughness ?? roughness)
        const heights2 = generateTerrainHeights()
        const world2 = await bootWorld()
        world2.reset(replay.header.gravityY)
        const sim2 = new MarbleSim(world2, {
            heights: heights2, enemySize: replay.header.enemySize, enemyMass: replay.header.enemyMass,
            seed: replay.header.seed, obstacles: replay.header.obstacles,
        })
        const cursor = new ReplayPlayer(replay)
        for (let i = 0; i < steps; i++) {
            const frame = cursor.next()!
            sim2.step(replay.header.fixedDt, frame.input, frame.params)
            expect(traj(sim2)).toEqual(liveTraj[i]) // bit-identical at EVERY step, not just the end
        }
        expect(cursor.done).toBe(true)
        world2.destroy()
    })
})
