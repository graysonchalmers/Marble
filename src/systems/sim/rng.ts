/**
 * systems/sim/rng.ts — deterministic PRNG for the simulation (F9).
 *
 * Everything inside the sim that needs randomness (obstacle scatter, AI search
 * waypoints) must draw from a seeded stream, never Math.random(), so that a
 * recorded seed + scripted input reproduces bit-identical runs (replays).
 *
 * mulberry32: tiny, fast, good-enough distribution for gameplay jitter.
 */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** Default seed used when a sim is constructed without one (tests, headless runs). */
export const DEFAULT_SIM_SEED = 0x5eed
