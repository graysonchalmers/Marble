/**
 * systems/replay/player.ts — cursor over a {@link Replay}'s frame stream.
 *
 * Pure playback bookkeeping only (no sim, no THREE): the scene owns the sim and
 * calls `next()` each tick to get the input+params to feed `sim.step`. Scrubbing
 * (`seek`) just moves the cursor; because sim state isn't snapshotted per frame,
 * the scene re-simulates from frame 0 to the target when the user scrubs backward.
 */
import type { Replay, ReplayFrame } from './types'

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v
}

export class ReplayPlayer {
    readonly replay: Replay
    /** Index of the NEXT frame `next()` will emit (0 .. frameCount). */
    private cursor = 0

    constructor(replay: Replay) {
        this.replay = replay
    }

    get frameCount(): number { return this.replay.frames.length }
    /** How many frames have been consumed (0 .. frameCount). */
    get position(): number { return this.cursor }
    /** 0..1 progress through the replay. */
    get progress(): number {
        return this.frameCount === 0 ? 1 : this.cursor / this.frameCount
    }
    get done(): boolean { return this.cursor >= this.frameCount }

    /** Emit the frame at the cursor and advance by one. Null once past the end. */
    next(): ReplayFrame | null {
        if (this.cursor >= this.frameCount) return null
        return this.replay.frames[this.cursor++]
    }

    /** Jump the cursor to a frame index (clamped). The scene re-sims to match. */
    seek(index: number): void {
        this.cursor = clamp(Math.floor(index), 0, this.frameCount)
    }

    /** Jump by a 0..1 fraction of the replay. */
    seekFraction(t: number): void {
        this.seek(Math.round(clamp(t, 0, 1) * this.frameCount))
    }

    /** Back to the start. */
    reset(): void { this.cursor = 0 }
}
