/**
 * state/replayStore.ts — standalone store for match replay (isolated from the big
 * settings/session GameStore on purpose, so replay can't destabilize gameplay state).
 *
 * Holds the last recorded match + the live replay-playback controls the ReplayBar
 * drives and Box3DReplayScene consumes. `epoch` bumps whenever playback must restart
 * from frame 0 (start / restart / seek) — the replay scene watches it to rebuild the
 * sim (WASM can't rewind, so a "restart" is a fresh sim fast-forwarded to the target).
 */
import { create } from 'zustand'
import type { Replay } from '../systems/replay/types'

export type ReplayCamera = 'chase' | 'orbit'

interface ReplayStore {
    /** Most recently recorded match (set at game over). Null until a match finishes. */
    lastReplay: Replay | null
    /** True while the replay scene is mounted and playing back. */
    isReplaying: boolean
    paused: boolean
    /** Playback speed multiplier (0.25 .. 2). */
    speed: number
    camera: ReplayCamera
    /** Target frame to (re)start playback from — consumed by the scene on `epoch` change. */
    seekFrame: number
    /** Bumps to force the replay scene to rebuild + fast-forward to `seekFrame`. */
    epoch: number
    /** Live playback position (frame index), pushed up by the scene for the scrub bar. */
    position: number
    /** Total frames in the active replay (mirrors lastReplay for the bar). */
    total: number

    setLastReplay: (r: Replay | null) => void
    startReplay: () => void
    stopReplay: () => void
    setPaused: (p: boolean) => void
    togglePaused: () => void
    setSpeed: (s: number) => void
    setCamera: (c: ReplayCamera) => void
    /** Restart playback from frame 0. */
    restart: () => void
    /** Seek to a frame (scene rebuilds + fast-forwards). */
    seekTo: (frame: number) => void
    /** Scene → store: report the current playback position. */
    reportPosition: (frame: number) => void
}

export const useReplayStore = create<ReplayStore>((set, get) => ({
    lastReplay: null,
    isReplaying: false,
    paused: false,
    speed: 1,
    camera: 'chase',
    seekFrame: 0,
    epoch: 0,
    position: 0,
    total: 0,

    setLastReplay: (r) => set({ lastReplay: r, total: r ? r.frames.length : 0 }),
    startReplay: () => {
        const r = get().lastReplay
        if (!r) return
        set((s) => ({
            isReplaying: true,
            paused: false,
            seekFrame: 0,
            position: 0,
            total: r.frames.length,
            epoch: s.epoch + 1,
        }))
    },
    stopReplay: () => set({ isReplaying: false, paused: false }),
    setPaused: (paused) => set({ paused }),
    togglePaused: () => set((s) => ({ paused: !s.paused })),
    setSpeed: (speed) => set({ speed }),
    setCamera: (camera) => set({ camera }),
    restart: () => set((s) => ({ seekFrame: 0, position: 0, paused: false, epoch: s.epoch + 1 })),
    seekTo: (frame) => set((s) => ({
        seekFrame: Math.max(0, Math.min(frame, s.total)),
        position: Math.max(0, Math.min(frame, s.total)),
        epoch: s.epoch + 1,
    })),
    reportPosition: (frame) => set({ position: frame }),
}))
