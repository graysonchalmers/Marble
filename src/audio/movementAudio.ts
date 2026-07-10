/**
 * audio/movementAudio.ts — pure mapping from motion → continuous-audio parameters.
 *
 * The rolling rumble and wind whoosh are continuous, procedurally-driven sounds whose
 * loudness + timbre track the ball's speed. Web Audio can't run headless (jsdom has no
 * AudioContext), so the *decision* — how fast maps to how loud / how bright — lives here
 * as a pure function that IS unit-testable, and SoundManager just applies the result to
 * its nodes each frame. Same "pure seam" pattern as systems/render/occlusion.ts.
 */

export interface MovementAudioConfig {
    /** Rolling rumble (grounded only). */
    rollMinSpeed: number   // below this ground speed, no roll sound
    rollMaxSpeed: number   // roll loudness maxes out here
    rollMaxGain: number    // peak roll gain
    rollMinCutoff: number  // lowpass cutoff (Hz) at low speed — dull rumble
    rollMaxCutoff: number  // lowpass cutoff (Hz) at high speed — brighter grind
    /** Wind whoosh (any state; boosted airborne). */
    windMinSpeed: number   // below this total speed, no wind
    windMaxSpeed: number   // wind loudness maxes out here
    windMaxGain: number    // peak wind gain
    airborneWindBoost: number // multiply wind gain when not grounded
}

export const MOVEMENT_AUDIO: MovementAudioConfig = {
    rollMinSpeed: 1.5,
    rollMaxSpeed: 20,
    rollMaxGain: 0.16,
    rollMinCutoff: 280,
    rollMaxCutoff: 1400,
    windMinSpeed: 9,
    windMaxSpeed: 32,
    windMaxGain: 0.11,
    airborneWindBoost: 1.7,
}

export interface MovementAudioParams {
    /** Rolling-rumble gain [0..rollMaxGain]. */
    rollGain: number
    /** Rolling-rumble lowpass cutoff (Hz). */
    rollCutoff: number
    /** Wind gain [0..rollMaxGain·boost]. */
    windGain: number
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

/**
 * @param groundSpeed horizontal speed (u/s) — drives the roll.
 * @param speed       total speed (u/s) — drives the wind.
 * @param grounded    is the ball on the ground this frame.
 */
export function computeMovementAudioParams(
    groundSpeed: number,
    speed: number,
    grounded: boolean,
    cfg: MovementAudioConfig = MOVEMENT_AUDIO
): MovementAudioParams {
    // Roll: grounded only. Slight sub-linear curve so slow creeping is still audible.
    const rollT = grounded
        ? clamp01((groundSpeed - cfg.rollMinSpeed) / (cfg.rollMaxSpeed - cfg.rollMinSpeed))
        : 0
    const rollGain = Math.pow(rollT, 0.8) * cfg.rollMaxGain
    const rollCutoff = cfg.rollMinCutoff + rollT * (cfg.rollMaxCutoff - cfg.rollMinCutoff)

    // Wind: total speed, quadratic ramp so it only really kicks in when you're moving fast;
    // boosted while airborne (a launched/falling ball catches more air).
    const windT = clamp01((speed - cfg.windMinSpeed) / (cfg.windMaxSpeed - cfg.windMinSpeed))
    const windGain = Math.pow(windT, 2) * cfg.windMaxGain * (grounded ? 1 : cfg.airborneWindBoost)

    return { rollGain, rollCutoff, windGain }
}
