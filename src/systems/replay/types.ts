/**
 * systems/replay/types.ts — deterministic match replay format.
 *
 * A replay is NOT a video. Because the sim is deterministic (F9: same seed + same
 * per-tick input + same construction config ⇒ bit-identical trajectories), a match
 * is captured as a tiny **header** (everything needed to rebuild the world + sim)
 * plus a **per-tick stream** of the exact `SimInput` + `SimParams` handed to
 * `MarbleSim.step`. Replaying = rebuild from the header, then feed the stream back
 * through a fresh sim at the same FIXED_DT. This is what lets replay use any camera:
 * the match is re-simulated live, not played from pixels.
 *
 * Terrain heights are intentionally NOT in the header — `generateTerrainHeights()`
 * is pure/deterministic and session-constant, so the scene reuses the same terrain
 * for live play and replay. (An optional `heights` field exists for headless tests
 * / future variable terrain.)
 */
import type { SimInput, SimParams, ObstacleConfig } from '../sim/MarbleSim'
import type { PhysicsFeel } from '../sim/tuning'

/** Bump when the header/frame shape changes incompatibly (guards old saved replays). */
export const REPLAY_VERSION = 2

export interface Vec3 { x: number; y: number; z: number }

/** Everything needed to reconstruct the world + sim exactly (the deterministic header). */
export interface ReplayHeader {
    version: number
    /** Seed for ALL sim randomness (obstacle scatter + AI waypoints). */
    seed: number
    /** Fixed sim timestep the frames were captured at (must match on replay). */
    fixedDt: number
    enemySize: number
    enemyMass: number
    /** Spawns — omit to use MarbleSim's defaults (the live game omits them, so replay must too). */
    playerSpawn?: Vec3
    enemySpawn?: Vec3
    /** Static obstacle scatter + prop count (omit for none). */
    obstacles?: ObstacleConfig
    /** Variable-floor roughness amplitude at record time (Phase P) — replay rebuilds the same
     *  terrain. Omit (old replays) → the scene falls back to the current live roughness. */
    terrainRoughness?: number
    /** World gravity applied at Box3DWorld creation (`world.reset(gravityY)`). */
    gravityY: number
    /** Physics feel (friction + jump impulse) passed to the sim. */
    physics?: PhysicsFeel
    /** Optional terrain (row-major, countX*countZ). Omit → scene's standard terrain / flat slab. */
    heights?: number[]
    heightsCountX?: number
    heightsCountZ?: number
    /** Wall-clock ms when recorded (display only — never fed to the sim). Stamped by the caller. */
    recordedAt?: number
    /** Final score / time-alive of the recorded run (display only). */
    finalScore?: number
    /** Optional human label. */
    label?: string
}

/** One sim tick's exact inputs — the two args (besides dt) that `sim.step` consumes. */
export interface ReplayFrame {
    input: SimInput
    params: SimParams
}

export interface Replay {
    header: ReplayHeader
    frames: ReplayFrame[]
}
