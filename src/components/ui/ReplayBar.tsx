/**
 * ReplayBar.tsx — playback controls for a recorded match (MVP: restart / play-pause /
 * speed / camera / progress / exit). Shown only while a replay is active. Talks to the
 * isolated replayStore; the Box3D scene consumes that state to drive playback.
 *
 * Deferred (named, not built): drag-scrub to an arbitrary frame + WebM movie export.
 */
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

export function ReplayBar() {
    const isReplaying = useReplayStore(s => s.isReplaying)
    const paused = useReplayStore(s => s.paused)
    const speed = useReplayStore(s => s.speed)
    const camera = useReplayStore(s => s.camera)
    const position = useReplayStore(s => s.position)
    const total = useReplayStore(s => s.total)

    if (!isReplaying) return null

    const progress = total > 0 ? Math.min(1, position / total) : 0
    const atEnd = total > 0 && position >= total
    const cycleSpeed = () => {
        const i = SPEEDS.indexOf(speed as typeof SPEEDS[number])
        useReplayStore.getState().setSpeed(SPEEDS[(i + 1) % SPEEDS.length])
    }
    const secondsAt = (frac: number) => ((total * frac) / 60).toFixed(1) // 60 Hz sim

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
                minWidth: 460,
            }}
        >
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

                <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />

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

            {/* Progress (read-only for MVP; drag-scrub is deferred) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", minWidth: 34, textAlign: 'right' }}>
                    {secondsAt(progress)}s
                </span>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${progress * 100}%`, height: '100%', background: '#24d6a2', transition: 'width 0.05s linear' }} />
                </div>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", minWidth: 34 }}>
                    {secondsAt(1)}s
                </span>
            </div>
        </div>
    )
}
