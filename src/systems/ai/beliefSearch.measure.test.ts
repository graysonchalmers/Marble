/**
 * Measurement + capture prep (not part of the normal suite; skipped unless MEASURE=1 / CAPTURE=1).
 * Does belief-map search find a hiding player sooner than the 4-waypoint spiral?
 *
 * Every match is built exactly like the live game (Box3DScene + buildReplayHeader): default settings' physics
 * preset + gravity, terrain roughness, cubes/pyramids, columns, props, crumble blocks, and the live per-step params.
 *
 *   MEASURE=1 FROM=1 SEEDS=20 [CAP=60] npx vitest run src/systems/ai/beliefSearch.measure.test.ts
 * Scenario (last-seen search): the enemy sees and chases the player, then the player slips out of view to a
 * seeded random spot >= 45 u away (teleport: "broke line of sight and moved somewhere unknown") and holds still.
 * Outcome = time from the slip to the catch (cap counts as the cap); also time to the first re-sighting.
 * Paired by seed (layout + hiding spot); judged by the sign test on decisive pairs (Tool-BehaviorLab rule).
 *
 *   CAPTURE=1 OUT=<dir> npx vitest run src/systems/ai/beliefSearch.measure.test.ts
 * Finds a replayable scenario using the game's own countdown head start (freezeEnemy): the player runs while the
 * enemy is pinned, keeps running after it wakes (it spots the player near the edge of its range and loses it), then
 * stops. Kept if both arms lose sight, the spiral doesn't find the player within 30 s and belief search does, and the
 * player ends up away from the walls (the chase camera frames it with the arena around it, not the void). Writes
 * two replays (same header + inputs + params, beliefSearch off / on) for the in-browser before/after capture.
 */
import { describe, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { Box3DWorld } from '../../physics/box3d/Box3DWorld'
import { loadBox3DBridge, loadBox3DBridgeModule } from '../../physics/box3d/box3dBridge'
import { useGameStore } from '../../store/useGameStore'
import { MarbleSim, type SimInput, type SimParams } from '../sim/MarbleSim'
import { FIXED_DT, PHYSICS_PRESETS } from '../sim/tuning'
import { generateTerrainHeights, getTerrainHeight, setTerrainRoughness } from '../../utils/terrain'
import { mulberry32 } from '../sim/rng'
import { REPLAY_VERSION, type Replay, type ReplayFrame } from '../replay/types'
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
const S = useGameStore.getState()
setTerrainRoughness(S.terrainRoughness)
const heights = generateTerrainHeights()
const PHYSICS = PHYSICS_PRESETS[S.physicsPreset] ?? PHYSICS_PRESETS.current
const OBSTACLES = {
    cubeCount: S.cubeCount, cubeScale: S.cubeScale, columnCount: S.columnCount, columnSize: S.columnSize,
    columnHeight: S.columnHeight, propCount: S.propCount, crumbleCount: S.crumbleCount, columnsCrumble: S.columnsCrumble,
    rampCubeRatio: S.rampCubeRatio,
}
const NO_INPUT: SimInput = { w: false, a: false, s: false, d: false, space: false, shift: false }

/** The live scene's per-step params (Box3DScene LIVE play), plus the flag. */
const liveParams = (beliefSearch: boolean): SimParams => ({
    enemySpeed: S.enemySpeed, enemyAirControl: S.enemyAirControl, playerDrift: S.playerDrift, downhillRoll: S.downhillRoll,
    jumpHeight: S.jumpHeight, moveTopSpeed: S.moveTopSpeed, moveAccel: S.moveAccel, moveBrakeDecel: S.moveBrakeDecel,
    moveAirControl: S.moveAirControl, enemyVelUnit: S.enemyVelUnit, enemyVelAccel: S.enemyVelAccel, beliefSearch,
})

/** A sim built the way Box3DScene builds one (from a replay header, or live settings with this seed). */
async function gameSim(seed: number, onCaught: () => void) {
    await loadBox3DBridge()
    const world = new Box3DWorld(await loadBox3DBridgeModule())
    world.reset(PHYSICS.gravityY)
    const sim = new MarbleSim(world, {
        heights, enemySize: S.enemySize, enemyMass: S.enemyMass, physics: PHYSICS, seed, obstacles: OBSTACLES,
        events: { onCaught },
    })
    return { world, sim }
}

async function match(seed: number, beliefSearch: boolean): Promise<{ t: number; found: number } | null> {
    let caught = -1, step = 0
    const { world, sim } = await gameSim(seed, () => { caught = step })
    const params = liveParams(beliefSearch)
    for (; step < 180 && sim.currentAIState !== 'chase'; step++) sim.step(FIXED_DT, NO_INPUT, params)
    if (sim.currentAIState !== 'chase') { world.destroy(); return null }   // never saw the player: no last-seen to search from
    const rng = mulberry32(seed * 7919 + 1), e = sim.enemyCurr.position
    let x = 0, z = 0
    for (let k = 0; k < 1000; k++) {
        x = (rng() - 0.5) * 108; z = (rng() - 0.5) * 108
        const clear = [...sim.cubePositions, ...sim.columnPositions].every((c) => Math.hypot(c.x - x, c.z - z) > S.cubeScale + 1)
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

// ---- Capture prep: an input-only before/after scenario, written as two replays ----------------------------------
const DIRS: Partial<SimInput>[] = [{ w: true }, { s: true }, { a: true }, { d: true }, { w: true, a: true }, { w: true, d: true }, { s: true, a: true }, { s: true, d: true }]
const CAPTURE_S = 30

async function scripted(seed: number, dir: Partial<SimInput>, freezeS: number, holdS: number, beliefSearch: boolean) {
    let caught = -1, step = 0, lost = false, seen = false
    const { world, sim } = await gameSim(seed, () => { caught = step })
    const live = liveParams(beliefSearch), frozen = { ...live, freezeEnemy: true }, frames: ReplayFrame[] = []
    const steps = Math.round(CAPTURE_S / FIXED_DT), freeze = Math.round(freezeS / FIXED_DT), hold = freeze + Math.round(holdS / FIXED_DT)
    for (; step < steps && (caught < 0 || step < caught + 90); step++) {
        const input = step < hold ? { ...NO_INPUT, ...dir } : NO_INPUT
        const params = step < freeze ? frozen : live
        frames.push({ input: { ...input }, params: { ...params } })
        sim.step(FIXED_DT, input, params)
        if (sim.currentAIState === 'alert' || sim.currentAIState === 'chase') seen = true
        if (seen && sim.currentAIState === 'search') lost = true
    }
    const hideX = sim.playerCurr.position.x, hideZ = sim.playerCurr.position.z
    world.destroy()
    return { caughtS: caught < 0 ? Infinity : caught * FIXED_DT, lost, frames, central: Math.max(Math.abs(hideX), Math.abs(hideZ)) < 50 }
}

describe.skipIf(!process.env.CAPTURE)('capture prep: before/after replays', () => {
    it('finds a scenario and writes the replays', { timeout: 3_600_000 }, async () => {
        type Run = Awaited<ReturnType<typeof scripted>>
        let best: { seed: number; d: number; freeze: number; hold: number; off: Run; on: Run } | null = null
        for (let seed = 1; seed <= 80 && !best; seed++)
            for (let d = 0; d < DIRS.length && !best; d++)
                for (const freeze of [1, 1.5, 2, 2.5])
                    for (const hold of [0.5, 1, 1.5, 2.5]) {
                        if (best) break
                        const off = await scripted(seed, DIRS[d], freeze, hold, false)
                        if (process.env.DIAG) console.log(`DIAG seed ${seed} dir ${d} freeze ${freeze} hold ${hold}: lost ${off.lost}, spiral caught ${off.caughtS.toFixed(1)}`)
                        if (!off.lost || off.caughtS < CAPTURE_S || !off.central) continue   // spiral loses it, never finds it; hides in the open (camera framing)
                        const on = await scripted(seed, DIRS[d], freeze, hold, true)
                        if (on.lost && on.caughtS > 8 && on.caughtS < 24) best = { seed, d, freeze, hold, off, on }
                    }
        if (!best) throw new Error('no scenario found in seeds 1-80')
        const header = {
            version: REPLAY_VERSION, seed: best.seed, fixedDt: FIXED_DT, enemySize: S.enemySize, enemyMass: S.enemyMass,
            gravityY: PHYSICS.gravityY, physics: PHYSICS, obstacles: OBSTACLES, terrainRoughness: S.terrainRoughness, recordedAt: 0,
        }
        const out = process.env.OUT ?? '.'
        fs.mkdirSync(out, { recursive: true })
        for (const [name, run] of [['spiral', best.off], ['belief', best.on]] as const) {
            const replay: Replay = { header: { ...header, label: `belief search ${name === 'belief' ? 'ON' : 'OFF'}` }, frames: run.frames }
            fs.writeFileSync(path.join(out, `replay-${name}.json`), JSON.stringify(replay))
        }
        console.log(`CAPTURE seed ${best.seed}, hold ${JSON.stringify(DIRS[best.d])}: head start ${best.freeze} s + ${best.hold} s: spiral not caught in ${CAPTURE_S} s; belief caught at ${best.on.caughtS.toFixed(1)} s -> ${out}`)
    })
})
