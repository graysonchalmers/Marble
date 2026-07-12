/**
 * ReplayBar.tsx — playback controls for a recorded match: restart / play-pause /
 * speed / slow-mo / camera / DRAGGABLE SCRUB / time-alive + countdown HUD / exit.
 * Shown only while a replay is active. Talks to the isolated replayStore; the Box3D
 * scene consumes that state to drive playback.
 *
 * Scrub: dragging the timeline pauses playback and previews the frame locally; on
 * release it commits `seekTo(frame)`, which bumps the store epoch so the scene
 * rebuilds the sim and fast-forwards to that frame (WASM can't rewind).
 */
import { useState } from 'react'
import { useReplayStore } from '../../state/replayStore'

const SPEEDS = [0.25, 0.5, 1, 2] as const

const btn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 8,
    color: '#fff',
    fontWeight: 700,
    padding: '8px 12px',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    lineHeight: 1,
}

const btnActive: React.CSSProperties = {
    ...btn,
    background: 'rgba(36,214,162,0.22)',
    borderColor: 'rgba(36,214,162,0.7)',
}

// ~1.5s at 60 Hz — matches the scene's slow-mo ramp window so the "TAG IN" countdown
// lights up exactly when time starts dilating.
const RAMP_FRAMES = 90

export function ReplayBar() {
    const isReplaying = useReplayStore(s => s.isReplaying)
    const paused = useReplayStore(s => s.paused)
    const speed = useReplayStore(s => s.speed)
    const slowmo = useReplayStore(s => s.slowmo)
    const camera = useReplayStore(s => s.camera)
    const position = useReplayStore(s => s.position)
    const total = useReplayStore(s => s.total)

    // Local scrub preview: non-null only while the user is dragging the timeline.
    const [scrub, setScrub] = useState<number | null>(null)

    if (!isReplaying) return null

    // Displayed frame = the live playback head, or the drag preview while scrubbing.
    const shownFrame = scrub ?? position
    const atEnd = total > 0 && position >= total && scrub === null
    const framesLeft = Math.max(0, total - shownFrame)

    const aliveSec = (shownFrame / 60).toFixed(1)   // 60 Hz sim
    const totalSec = (total / 60).toFixed(1)
    const leftSec = (framesLeft / 60).toFixed(1)

    const cycleSpeed = () => {
        const i = SPEEDS.indexOf(speed as typeof SPEEDS[number])
        useReplayStore.getState().setSpeed(SPEEDS[(i + 1) % SPEEDS.length])
    }

    // Drag: preview locally + pause so the head doesn't run out from under the thumb.
    const onScrubInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = Number(e.target.value)
        setScrub(f)
        if (!useReplayStore.getState().paused) useReplayStore.getState().setPaused(true)
    }
    // Release: commit the seek (rebuild + fast-forward) and drop the local preview.
    const commitScrub = () => {
        if (scrub === null) return
        useReplayStore.getState().seekTo(scrub)
        setScrub(null)
    }

    return (
        <div
            style={{
                position: 'absolute',
                left: '50%',
                bottom: 24,
                transform: 'translateX(-50%)',
                zIndex: 'var(--z-menu)' as unknown as number,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '12px 14px',
                background: 'rgba(10,10,12,0.92)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 14,
                boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
                pointerEvents: 'auto',
                fontFamily: "'Inter', sans-serif",
                minWidth: 480,
            }}
        >
            {/* Time-alive + countdown-to-tag HUD */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 15, fontFamily: "'JetBrains Mono', monospace" }}>
                    ⏱ {aliveSec}s <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600, fontSize: 12 }}>alive</span>
                </span>
                {atEnd ? (
                    <span style={{ color: '#ff5a5a', fontWeight: 900, fontSize: 15, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                        🔴 TAGGED
                    </span>
                ) : framesLeft <= RAMP_FRAMES ? (
                    <span style={{ color: '#ffd23f', fontWeight: 900, fontSize: 15, letterSpacing: 0.5, fontFamily: "'JetBrains Mono', monospace" }}>
                        ⏳ TAG IN {leftSec}s
                    </span>
                ) : (
                    <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 600, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                        survived {totalSec}s
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#24d6a2', fontWeight: 800, letterSpacing: 1, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                    ● REPLAY
                </span>

                <button style={btn} title="Restart from the beginning" onClick={() => useReplayStore.getState().restart()}>⏮</button>

                <button
                    style={btn}
                    title={atEnd ? 'Restart' : paused ? 'Play' : 'Pause'}
                    onClick={() => {
                        const st = useReplayStore.getState()
                        if (atEnd) st.restart()
                        else st.togglePaused()
                    }}
                >
                    {atEnd ? '↺' : paused ? '▶' : '⏸'}
                </button>

                <button style={btn} title="Playback speed" onClick={cycleSpeed}>{speed}×</button>

                <button
                    style={slowmo ? btnActive : btn}
                    title="Slow-mo: dilate time over the final ~1.5s into the tag"
                    onClick={() => useReplayStore.getState().toggleSlowmo()}
                >
                    🐢 Slo-mo
                </button>

                <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />

                <button
                    style={camera === 'free' ? btnActive : btn}
                    title="Free orbit — drag to spin around the ball, scroll to zoom (always follows the player)"
                    onClick={() => useReplayStore.getState().setCamera('free')}
                >
                    Free
                </button>
                <button
                    style={camera === 'chase' ? btnActive : btn}
                    onClick={() => useReplayStore.getState().setCamera('chase')}
                >
                    Chase
                </button>
                <button
                    style={camera === 'orbit' ? btnActive : btn}
                    onClick={() => useReplayStore.getState().setCamera('orbit')}
                >
                    Orbit
                </button>

                <div style={{ flex: 1 }} />

                <button
                    style={{ ...btn, borderColor: 'rgba(255,120,120,0.5)' }}
                    title="Exit replay"
                    onClick={() => useReplayStore.getState().stopReplay()}
                >
                    ✕ Exit
                </button>
            </div>

            {/* Draggable scrub timeline. Dragging pauses + previews; release seeks. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", minWidth: 38, textAlign: 'right' }}>
                    {aliveSec}s
                </span>
                <input
                    type="range"
                    min={0}
                    max={Math.max(1, total)}
                    step={1}
                    value={shownFrame}
                    onChange={onScrubInput}
                    onMouseUp={commitScrub}
                    onTouchEnd={commitScrub}
                    title="Drag to scrub — release to jump to that moment"
                    style={{
                        flex: 1,
                        height: 6,
                        cursor: 'pointer',
                        accentColor: '#24d6a2',
                    }}
                />
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", minWidth: 38 }}>
                    {totalSec}s
                </span>
            </div>
        </div>
    )
}
