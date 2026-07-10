/**
 * systems/replay/recorder.ts — captures a live match into a {@link Replay}.
 *
 * Usage (in the scene's sim tick):
 *   recorder.start(header)                       // at match start, from sim + world config
 *   recorder.capture(input, params)              // once per sim tick, BEFORE/with sim.step
 *   const replay = recorder.stop()               // at game over
 *
 * `capture` deep-copies `input` and `params` because the scene mutates the input
 * ref in place every frame and reuses param objects — storing references would
 * alias the whole recording to the latest frame.
 */
import type { SimInput, SimParams } from '../sim/MarbleSim'
import type { Replay, ReplayHeader, ReplayFrame } from './types'

function cloneInput(i: SimInput): SimInput {
    return { w: i.w, a: i.a, s: i.s, d: i.d, space: i.space, shift: i.shift }
}

function cloneParams(p: SimParams): SimParams {
    // Shallow clone is sufficient — SimParams is a flat bag of primitives.
    return { ...p }
}

export class ReplayRecorder {
    private header: ReplayHeader | null = null
    private frames: ReplayFrame[] = []
    private recording = false

    /** Begin a new recording. Discards any previous in-progress capture. */
    start(header: ReplayHeader): void {
        this.header = header
        this.frames = []
        this.recording = true
    }

    /** Record one sim tick's exact inputs. No-op if not currently recording. */
    capture(input: SimInput, params: SimParams): void {
        if (!this.recording) return
        this.frames.push({ input: cloneInput(input), params: cloneParams(params) })
    }

    /** Finish and return the immutable replay (or null if nothing was recorded). */
    stop(): Replay | null {
        this.recording = false
        if (!this.header || this.frames.length === 0) return null
        return { header: this.header, frames: this.frames }
    }

    /** Abort without producing a replay (e.g. restart before game over). */
    cancel(): void {
        this.recording = false
        this.header = null
        this.frames = []
    }

    get isRecording(): boolean { return this.recording }
    get frameCount(): number { return this.frames.length }
}
