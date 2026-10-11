/**
 * Measurement (not part of the normal suite): does belief-map search find a hiding player sooner than the
 * 4-waypoint spiral? Real MarbleSim + WASM, real terrain + default obstacles, layouts by seed.
 *   MEASURE=1 FROM=1 SEEDS=20 npx vitest run src/systems/ai/beliefSearch.measure.test.ts
 * Scenario (last-seen search): the enemy sees and chases the player, then the player slips out of view to a
 * seeded random spot >= 45 u away (teleport: "broke line of sight and moved somewhere unknown") and holds still.
 * Outcome = time from the slip to the catch (cap counts as the cap); also time to the first re-sighting.
 * Paired by seed (layout + hiding spot); judged by the sign test on decisive pairs (Tool-BehaviorLab rule).
 */
import { describe, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { Box3DWorld } from '../../physics/box3d/Box3DWorld'
import { loadBox3DBridge, loadBox3DBridgeModule } from '../../physics/box3d/box3dBridge'
import { useGameStore } from '../../store/useGameStore'
import { MarbleSim, type SimInput, type SimParams } from '../sim/MarbleSim'
import { FIXED_DT } from '../sim/tuning'
import { generateTerrainHeights, getTerrainHeight } from '../../utils/terrain'
import { mulberry32 } from '../sim/rng'
// @ts-expect-error - compiled JS module doesn't have TS declarations
import createMarbleBox3DBridgeModule from '../../../public/box3d/box3d_bridge.js'

const wasm = fs.readFileSync(path.resolve(process.cwd(), 'public/box3d/box3d_bridge.wasm'))
globalThis.fetch = (async (url: string) => url.endsWith('bridge-manifest.json')
    ? { ok: true, status: 200, text: async () => JSON.stringify({ version: '0.1.0', moduleUrl: '/box3d/box3d_bridge.js', wasmUrl: '/box3d/box3d_bridge.wasm' }) }
    : url.endsWith('box3d_bridge.wasm')
        ? { ok: true, status: 200, arrayBuffer: async () => wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) }
        : { ok: false, status: 404, text: async () => 'Not found' }) as unknown as typeof fetch
const g = globalThis as Record<string, unknown>
g.window = globalThis
g.createMarbleBox3DBridgeModule = createMarbleBox3DBridgeModule

const CAP_S = Number(process.env.CAP ?? 60)
const heights = generateTerrainHeights()

const NO_INPUT: SimInput = { w: false, a: false, s: false, d: false, space: false, shift: false }

async function match(seed: number, beliefSearch: boolean): Promise<{ t: number; found: number } | null> {
    await loadBox3DBridge()
    const world = new Box3DWorld(await loadBox3DBridgeModule())
    world.reset()
    const s = useGameStore.getState()
    let caught = -1, step = 0
    const sim = new MarbleSim(world, {
        heights, enemySize: s.enemySize, enemyMass: s.enemyMass, seed,
        obstacles: { cubeCount: s.cubeCount, cubeScale: s.cubeScale, columnCount: s.columnCount, columnSize: s.columnSize,
            columnHeight: s.columnHeight, propCount: 0, crumbleCount: 0, columnsCrumble: false, rampCubeRatio: s.rampCubeRatio },
        events: { onCaught: () => { caught = step } },
    })
    const params: SimParams = { enemySpeed: s.enemySpeed, enemyAirControl: s.enemyAirControl, beliefSearch }
    for (; step < 180 && sim.currentAIState !== 'chase'; step++) sim.step(FIXED_DT, NO_INPUT, params)
    if (sim.currentAIState !== 'chase') { world.destroy(); return null }   // never saw the player: no last-seen to search from
    const rng = mulberry32(seed * 7919 + 1), e = sim.enemyCurr.position
    let x = 0, z = 0
    for (let k = 0; k < 1000; k++) {
        x = (rng() - 0.5) * 108; z = (rng() - 0.5) * 108
        const clear = [...sim.cubePositions, ...sim.columnPositions].every((c) => Math.hypot(c.x - x, c.z - z) > s.cubeScale + 1)
        if (clear && Math.hypot(x - e.x, z - e.z) >= 45) break
    }
    world.bodySetTransform(sim.playerBodyPtr, x, getTerrainHeight(x, z) + 1.5, z, 0, 0, 0, 1)
    world.setLinearVelocity(sim.playerBodyPtr, 0, 0, 0)
    const slip = step, steps = slip + Math.round(CAP_S / FIXED_DT)
    let found = -1
    for (; step < steps && caught < 0; step++) {
        sim.step(FIXED_DT, NO_INPUT, params)
        if (found < 0 && step > slip + 10 && sim.currentAIState === 'chase') found = step
    }
    world.destroy()
    const end = caught < 0 ? steps : caught
    return { t: (end - slip) * FIXED_DT, found: ((found < 0 ? steps : found) - slip) * FIXED_DT }
}

const signP = (w: number, l: number) => { const n = w + l; let pmf = 0.5 ** n, p = 0; for (let k = 0; k <= n; k++) { if (k >= w) p += pmf; pmf = (pmf * (n - k)) / (k + 1) } return Math.min(1, p) }
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

describe.skipIf(!process.env.MEASURE)('belief search vs spiral search (measurement)', () => {
    it('paired by layout seed', { timeout: 3_600_000 }, async () => {
        const from = Number(process.env.FROM ?? 1), n = Number(process.env.SEEDS ?? 20)
        const off: number[] = [], on: number[] = [], fOff: number[] = [], fOn: number[] = []
        let sooner = 0, later = 0, skipped = 0
        const t0 = Date.now()
        for (let seed = from; seed < from + n; seed++) {
            const a = await match(seed, false), b = await match(seed, true)
            if (!a || !b) { skipped++; console.log(`seed ${seed}: skipped (enemy never saw the player at spawn)`); continue }
            off.push(a.t); on.push(b.t); fOff.push(a.found); fOn.push(b.found)
            if (b.t < a.t) sooner++; else if (a.t < b.t) later++
            console.log(`seed ${seed}: spiral caught ${a.t.toFixed(1)} s (re-seen ${a.found.toFixed(1)}) | belief caught ${b.t.toFixed(1)} s (re-seen ${b.found.toFixed(1)})`)
        }
        console.log(`RESULT seeds ${from}-${from + n - 1} (${off.length} used, ${skipped} skipped), cap ${CAP_S} s: catch median spiral ${med(off).toFixed(1)} -> belief ${med(on).toFixed(1)} s; ` +
            `belief sooner ${sooner} / later ${later} / ties ${off.length - sooner - later}, sign p=${signP(sooner, later).toFixed(4)}; ` +
            `caught ${off.filter((t) => t < CAP_S).length} vs ${on.filter((t) => t < CAP_S).length}; re-seen median ${med(fOff).toFixed(1)} -> ${med(fOn).toFixed(1)} s; wall ${((Date.now() - t0) / 1000).toFixed(0)} s`)
    })
})
