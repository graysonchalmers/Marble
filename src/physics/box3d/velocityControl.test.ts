/**
 * Velocity-driven movement model (Known issue #4 fix) — headless tests against
 * the REAL MarbleSim.step() with the compiled WASM bridge. Verifies the player is
 * driven to top speed and rolls WITHOUT slipping (ω = v/r); the release glide/drift;
 * gravity-driven downhill roll on a real slope; the height-derived jump; and the
 * enemy running the SAME velocity drive as the player. Mirrors the integration setup.
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { Box3DWorld } from './Box3DWorld'
import { loadBox3DBridge, loadBox3DBridgeModule } from './box3dBridge'
import { useGameStore } from '../../store/useGameStore'
import { MarbleSim, type SimInput, type SimParams } from '../../systems/sim/MarbleSim'
import { FIXED_DT, PLAYER, MOVEMENT, TERRAIN } from '../../systems/sim/tuning'
import { getTerrainHeight } from '../../utils/terrain'
// @ts-expect-error - compiled JS module doesn't have TS declarations
import createMarbleBox3DBridgeModule from '../../../public/box3d/box3d_bridge.js'

const wasmPath = path.resolve(process.cwd(), 'public/box3d/box3d_bridge.wasm')
const wasmBuffer = fs.readFileSync(wasmPath)
const manifest = { version: '0.1.0', moduleUrl: '/box3d/box3d_bridge.js', wasmUrl: '/box3d/box3d_bridge.wasm' }

const mockFetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('bridge-manifest.json')) {
        return { ok: true, status: 200, async text() { return JSON.stringify(manifest) } }
    }
    if (url.endsWith('box3d_bridge.wasm')) {
        return {
            ok: true, status: 200,
            async arrayBuffer() {
                return wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength)
            }
        }
    }
    return { ok: false, status: 404, async text() { return 'Not found' } }
})

globalThis.fetch = mockFetch as any
const globalObj = globalThis as any
globalObj.window = globalThis
globalObj.createMarbleBox3DBridgeModule = createMarbleBox3DBridgeModule

const NO_INPUT: SimInput = { w: false, a: false, s: false, d: false, space: false, shift: false }
const VEL_PARAMS: SimParams = { enemySpeed: 0, enemyAirControl: 0, movementModel: 'velocity' }

async function bootWorld(): Promise<Box3DWorld> {
    const status = await loadBox3DBridge()
    expect(status.available).toBe(true)
    const bridge = await loadBox3DBridgeModule()
    const world = new Box3DWorld(bridge)
    world.reset()
    return world
}

function makeSim(world: Box3DWorld): MarbleSim {
    const s = useGameStore.getState()
    // Flat slab (no heights); enemy parked far away and inert (enemySpeed 0).
    return new MarbleSim(world, {
        enemySize: s.enemySize,
        enemyMass: s.enemyMass,
        playerSpawn: { x: 0, y: 1.0, z: 0 },
        enemySpawn: { x: 0, y: 0.5 + s.enemySize, z: -40 }
    })
}

/**
 * Heightfield sampled from the analytic terrain formula (getTerrainHeight) at the
 * exact node world positions MarbleSim places them (worldX = gx·scale − 63), so the
 * physics surface and the analytic gradient the downhill code reads are consistent.
 */
function analyticHeights(): Float32Array {
    const W = TERRAIN.width, D = TERRAIN.depth, S = TERRAIN.scale
    const off = -((W - 1) * S) / 2
    const h = new Float32Array(W * D)
    for (let gz = 0; gz < D; gz++) {
        for (let gx = 0; gx < W; gx++) {
            h[gz * W + gx] = getTerrainHeight(gx * S + off, gz * S + off)
        }
    }
    return h
}

/** Analytic terrain gradient magnitude at a world point (matches the sim's downhill probe). */
function slopeAt(x: number, z: number): number {
    const eps = 0.75
    const dhdx = (getTerrainHeight(x + eps, z) - getTerrainHeight(x - eps, z)) / (2 * eps)
    const dhdz = (getTerrainHeight(x, z + eps) - getTerrainHeight(x, z - eps)) / (2 * eps)
    return Math.hypot(dhdx, dhdz)
}

describe('Velocity-driven movement model (Known #4 fix)', () => {
    it('drives the ball to ~top speed forward (-Z) and slaves spin to motion (no slip)', async () => {
        const world = await bootWorld()
        const sim = makeSim(world)
        const FWD: SimInput = { ...NO_INPUT, w: true }

        // Hold forward ~0.5s (accel 60 u/s² reaches topSpeed 20 in ~0.33s).
        for (let i = 0; i < 30; i++) sim.step(FIXED_DT, FWD, VEL_PARAMS)

        const vel = world.getLinearVelocity(sim.playerBodyPtr)
        const ang = world.getAngularVelocity(sim.playerBodyPtr)
        const speed = Math.hypot(vel.x, vel.z)

        // Forward is -Z, at (near) top speed.
        expect(vel.z).toBeLessThan(-15)
        expect(speed).toBeGreaterThan(MOVEMENT.topSpeed - 3)
        expect(speed).toBeLessThan(MOVEMENT.topSpeed + 2)

        // Rolling without slip: ω = (v_z/r, 0, -v_x/r). For pure -Z motion, ω_x ≈ v_z/r.
        const r = PLAYER.radius
        expect(ang.x).toBeLessThan(0)                                   // spins the right way
        expect(Math.abs(ang.x - vel.z / r)).toBeLessThan(5)             // magnitude tracks v/r (|v/r|≈40)
        expect(Math.abs(ang.z)).toBeLessThan(5)                         // negligible cross-axis spin
    })

    it('decelerates to rest when input is released', async () => {
        const world = await bootWorld()
        const sim = makeSim(world)
        const FWD: SimInput = { ...NO_INPUT, w: true }
        const SNAPPY: SimParams = { ...VEL_PARAMS, playerDrift: 0.2 }

        for (let i = 0; i < 30; i++) sim.step(FIXED_DT, FWD, SNAPPY)     // spin up
        for (let i = 0; i < 45; i++) sim.step(FIXED_DT, NO_INPUT, SNAPPY) // release (~0.75s)

        const vel = world.getLinearVelocity(sim.playerBodyPtr)
        expect(Math.hypot(vel.x, vel.z)).toBeLessThan(1.0)
    })

    it('higher drift glides longer (retains more speed after release) than lower drift', async () => {
        const FWD: SimInput = { ...NO_INPUT, w: true }
        const coastSpeed = async (drift: number): Promise<number> => {
            const world = await bootWorld()
            const sim = makeSim(world)
            const params: SimParams = { ...VEL_PARAMS, playerDrift: drift }
            for (let i = 0; i < 30; i++) sim.step(FIXED_DT, FWD, params)      // spin up to top speed
            for (let i = 0; i < 20; i++) sim.step(FIXED_DT, NO_INPUT, params) // coast ~0.33s
            const v = world.getLinearVelocity(sim.playerBodyPtr)
            world.destroy()
            return Math.hypot(v.x, v.z)
        }
        const floaty = await coastSpeed(0.9)
        const snappy = await coastSpeed(0.1)
        expect(floaty).toBeGreaterThan(snappy + 3)  // clearly more inertia at high drift
        expect(snappy).toBeLessThan(5)              // low drift has largely stopped
    })
})

describe('Downhill roll (coast on a slope)', () => {
    it('rolls toward lower terrain when coasting (downhillRoll>0), holds position at 0', async () => {
        const heights = analyticHeights()
        const STEPS = 260

        // Pick a clearly-sloped spawn point inside the play area.
        let spawn = { x: 8, z: 8 }
        let best = 0
        for (let x = -16; x <= 16; x += 2) {
            for (let z = -16; z <= 16; z += 2) {
                const g = slopeAt(x, z)
                if (g > best) { best = g; spawn = { x, z } }
            }
        }
        expect(best).toBeGreaterThan(0.1) // sanity: we found a real slope
        const startH = getTerrainHeight(spawn.x, spawn.z)

        const coast = async (downhillRoll: number) => {
            const s = useGameStore.getState()
            const world = await bootWorld()
            const sim = new MarbleSim(world, {
                heights,
                enemySize: s.enemySize,
                enemyMass: s.enemyMass,
                playerSpawn: { x: spawn.x, y: startH + 0.45, z: spawn.z }, // small drop → minimal landing transient
                enemySpawn: { x: 80, y: 30, z: 80 } // inert (enemySpeed 0), far away
            })
            const params: SimParams = {
                enemySpeed: 0, enemyAirControl: 0, movementModel: 'velocity',
                downhillRoll, playerDrift: 0.6
            }
            for (let i = 0; i < STEPS; i++) sim.step(FIXED_DT, NO_INPUT, params)
            const p = sim.playerCurr.position.clone()
            world.destroy()
            return {
                travel: Math.hypot(p.x - spawn.x, p.z - spawn.z),
                endH: getTerrainHeight(p.x, p.z)
            }
        }

        const rolled = await coast(1)
        const still = await coast(0)

        // Downhill roll carries the ball clearly farther than with it off,
        expect(rolled.travel).toBeGreaterThan(still.travel + 0.8)
        // to LOWER terrain than it started.
        expect(rolled.endH).toBeLessThan(startH - 0.3)
    })
})

describe('Height-based jump', () => {
    it('jump apex tracks the target height (vy = sqrt(2·g·h), mass-free)', async () => {
        const s = useGameStore.getState()
        const world = await bootWorld() // gravity -9.81 (matches sim default "current")
        // Spawn off-origin: world.reset()'s leftover smoke-test sphere sits at (0,y,0)
        // (see STATUS Known issue — clearBodies doesn't remove dynamic bodies), and a
        // straight-up jump through the origin column would collide with it.
        const sim = new MarbleSim(world, {
            enemySize: s.enemySize, enemyMass: s.enemyMass,
            playerSpawn: { x: 6, y: 1.0, z: 6 },
            enemySpawn: { x: 80, y: 2, z: 80 }
        })
        const target = 2.0
        const params: SimParams = { ...VEL_PARAMS, jumpHeight: target }

        for (let i = 0; i < 20; i++) sim.step(FIXED_DT, NO_INPUT, params) // settle grounded
        const baseY = sim.playerCurr.position.y

        let maxY = baseY
        sim.step(FIXED_DT, { ...NO_INPUT, space: true }, params) // jump
        for (let i = 0; i < 130; i++) {
            sim.step(FIXED_DT, NO_INPUT, params)
            maxY = Math.max(maxY, sim.playerCurr.position.y)
        }
        const apex = maxY - baseY
        // Close to the target (linear damping shaves a few %). Proves height-derived jump.
        expect(apex).toBeGreaterThan(target * 0.8)
        expect(apex).toBeLessThan(target * 1.15)
        world.destroy()
    })
})

describe('Enemy velocity model (same drive as the player)', () => {
    it('drives the enemy toward the player, closes distance, and slaves spin to motion', async () => {
        const s = useGameStore.getState()
        const world = await bootWorld()
        const sim = new MarbleSim(world, {
            enemySize: s.enemySize,
            enemyMass: s.enemyMass,
            playerSpawn: { x: 0, y: 1.0, z: 0 },
            enemySpawn: { x: 0, y: 0.5 + s.enemySize, z: -15 } // within vision (40u)
        })
        // enemyMovementModel omitted → defaults to 'velocity'; player stationary.
        const params: SimParams = { enemySpeed: s.enemySpeed, enemyAirControl: 0, movementModel: 'velocity' }

        const startDist = sim.enemyCurr.position.distanceTo(sim.playerCurr.position)

        let sampledSlipErr = Infinity
        let sampledSpeed = 0
        for (let i = 0; i < 90; i++) {
            sim.step(FIXED_DT, NO_INPUT, params)
            if (i === 45) {
                const v = world.getLinearVelocity(sim.enemyBodyPtr)
                const a = world.getAngularVelocity(sim.enemyBodyPtr)
                sampledSpeed = Math.hypot(v.x, v.z)
                // Enemy spin is slaved: ω_x = v_z / r.
                sampledSlipErr = Math.abs(a.x - v.z / s.enemySize)
            }
        }
        const endDist = sim.enemyCurr.position.distanceTo(sim.playerCurr.position)

        expect(endDist).toBeLessThan(startDist - 4)  // clearly closed on the player
        expect(sampledSpeed).toBeGreaterThan(5)      // reached a real chase speed
        expect(sampledSlipErr).toBeLessThan(3)       // rolling without slip
        expect(sim.enemyGrounded).toBe(true)         // enemy telemetry populated (render trail gate)
        expect(Math.hypot(sim.enemyVel.x, sim.enemyVel.z)).toBeGreaterThan(1)
        world.destroy()
    })
})

describe('Countdown early-release (freezeEnemy pins the enemy)', () => {
    it('keeps the enemy at spawn while the player drives, vs chasing when unfrozen', async () => {
        const s = useGameStore.getState()
        const FWD: SimInput = { ...NO_INPUT, w: true }
        const params: SimParams = { enemySpeed: 2, enemyAirControl: 0, movementModel: 'velocity' }

        // Frozen: enemy stays put even though it can see the player (z=-15 < 40u vision).
        const w1 = await bootWorld()
        const frozen = new MarbleSim(w1, {
            enemySize: s.enemySize, enemyMass: s.enemyMass,
            playerSpawn: { x: 0, y: 1.0, z: 0 },
            enemySpawn: { x: 0, y: 0.5 + s.enemySize, z: -15 }
        })
        const spawn = frozen.enemyCurr.position.clone()
        for (let i = 0; i < 60; i++) frozen.step(FIXED_DT, FWD, { ...params, freezeEnemy: true })
        const enemyDrift = frozen.enemyCurr.position.distanceTo(spawn)
        const playerTravel = Math.hypot(frozen.playerCurr.position.x, frozen.playerCurr.position.z)
        const frozenGrounded = frozen.enemyGrounded
        w1.destroy()

        // Unfrozen control: identical setup, the enemy chases and closes distance.
        const w2 = await bootWorld()
        const live = new MarbleSim(w2, {
            enemySize: s.enemySize, enemyMass: s.enemyMass,
            playerSpawn: { x: 0, y: 1.0, z: 0 },
            enemySpawn: { x: 0, y: 0.5 + s.enemySize, z: -15 }
        })
        const startDist = live.enemyCurr.position.distanceTo(live.playerCurr.position)
        for (let i = 0; i < 60; i++) live.step(FIXED_DT, NO_INPUT, params)
        const endDist = live.enemyCurr.position.distanceTo(live.playerCurr.position)
        w2.destroy()

        expect(enemyDrift).toBeLessThan(0.5)        // enemy stayed pinned at spawn
        expect(frozenGrounded).toBe(false)          // telemetry reflects the frozen state
        expect(playerTravel).toBeGreaterThan(2)     // player took a real head start
        expect(endDist).toBeLessThan(startDist - 4) // and would have been chased if not frozen
    })
})

describe('Cosmetic FX events (render-only, do not affect determinism)', () => {
    it('fires onLand after a hard fall to the ground', async () => {
        const s = useGameStore.getState()
        const world = await bootWorld()
        let lands = 0
        let lastSpeed = 0
        const sim = new MarbleSim(world, {
            enemySize: s.enemySize, enemyMass: s.enemyMass,
            playerSpawn: { x: 6, y: 7, z: 6 }, // off-origin (avoid the smoke sphere), high drop
            enemySpawn: { x: 80, y: 2, z: 80 },
            events: { onLand: (_x, _y, _z, spd) => { lands++; lastSpeed = spd } }
        })
        for (let i = 0; i < 160; i++) sim.step(FIXED_DT, NO_INPUT, VEL_PARAMS)
        expect(lands).toBeGreaterThan(0)
        expect(lastSpeed).toBeGreaterThan(5)
        world.destroy()
    })

    it('fires onImpact when the player is driven into the arena wall', async () => {
        const s = useGameStore.getState()
        const world = await bootWorld()
        const heights = analyticHeights() // real terrain → boundary walls exist
        let impacts = 0
        const startH = getTerrainHeight(50, 0)
        const sim = new MarbleSim(world, {
            heights, enemySize: s.enemySize, enemyMass: s.enemyMass,
            playerSpawn: { x: 50, y: startH + 0.6, z: 0 }, // near the +X wall (~x=61)
            enemySpawn: { x: -50, y: 30, z: 0 },
            events: { onImpact: () => { impacts++ } }
        })
        const DRIVE: SimInput = { ...NO_INPUT, d: true } // +X into the wall
        const params: SimParams = { enemySpeed: 0, enemyAirControl: 0, movementModel: 'velocity' }
        for (let i = 0; i < 240; i++) sim.step(FIXED_DT, DRIVE, params)
        expect(impacts).toBeGreaterThan(0)
        world.destroy()
    })
})
