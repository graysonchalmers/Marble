import { useState } from 'react'
import { useGameStore } from '../../store/useGameStore'
import { PLAYFEEL_PRESETS } from '../../systems/sim/tuning'

export function UnifiedDebugMenu() {
    const useV2AI = useGameStore(s => s.useV2AI)
    const enemyAIState = useGameStore(s => s.enemyAIState)
    const playerPosition = useGameStore(s => s.playerPosition)
    const enemyPosition = useGameStore(s => s.enemyPosition)
    const perfStats = useGameStore(s => s.perfStats)
    const audioDebugMode = useGameStore(s => s.audioDebugMode)
    const setAudioDebugMode = (val: { closingEnabled: boolean, openingEnabled: boolean }) => useGameStore.setState({ audioDebugMode: val })
    const physicsPreset = useGameStore(s => s.physicsPreset)
    const movementModel = useGameStore(s => s.movementModel)
    const enemyMovementModel = useGameStore(s => s.enemyMovementModel)
    const playerDrift = useGameStore(s => s.playerDrift)
    const downhillRoll = useGameStore(s => s.downhillRoll)
    const jumpHeight = useGameStore(s => s.jumpHeight)
    const playfeelPreset = useGameStore(s => s.playfeelPreset)
    const applyPlayfeelPreset = useGameStore(s => s.applyPlayfeelPreset)
    const setSetting = useGameStore(s => s.setSetting)

    // Default to OPEN
    const [isOpen, setIsOpen] = useState(true)

    // Calculate distance for display
    const distance = Math.sqrt(
        Math.pow(playerPosition.x - enemyPosition.x, 2) +
        Math.pow(playerPosition.y - enemyPosition.y, 2) +
        Math.pow(playerPosition.z - enemyPosition.z, 2)
    )

    const stateColors: Record<string, string> = {
        idle: '#888888',
        alert: '#ffaa00', // Amber
        chase: '#E53935', // Red (keep for critical)
        search: '#ff8800' // Orange
    }

    return (
        <div className="debug-menu-wrapper">
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="debug-menu-toggle"
                style={{
                    color: isOpen ? '#ffffff' : '#888',
                }}
            >
                <span style={{ fontSize: '14px' }}>{isOpen ? '▼' : '▶'}</span>
                DEV TOOLS
            </button>

            {/* Menu Content */}
            {isOpen && (
                <div className="debug-menu-content">
                    {/* Section: Perf Stats */}
                    <div style={{ marginBottom: '16px' }}>
                        <div className="debug-section-title">
                            Performance
                        </div>
                        <div className="debug-row">
                            <span style={{ color: '#fff' }}>FPS</span>
                            <span style={{ color: perfStats.fps < 30 ? '#ff4444' : '#fff' }}>{perfStats.fps}</span>
                        </div>
                        <div className="debug-row">
                            <span>Sim Tick</span>
                            <span>{perfStats.simMs || 0} ms</span>
                        </div>
                        <div className="debug-row">
                            <span>Render CPU</span>
                            <span>{perfStats.renderMs || 0} ms</span>
                        </div>
                        <div className="debug-row">
                            <span>Draw Calls</span>
                            <span>{perfStats.drawCalls || 0}</span>
                        </div>
                        <div className="debug-row">
                            <span>Triangles</span>
                            <span>{perfStats.triangles || 0}</span>
                        </div>
                        <div className="debug-row">
                            <span>Geometries</span>
                            <span>{perfStats.geometries || 0}</span>
                        </div>
                        <div className="debug-row">
                            <span>Textures</span>
                            <span>{perfStats.textures || 0}</span>
                        </div>
                        <div className="debug-row">
                            <span>JS Heap</span>
                            <span>{perfStats.memory > 0 ? `${perfStats.memory} MB` : '--'}</span>
                        </div>
                    </div>

                    <div className="debug-divider" />

                    {/* Section: AI Status */}
                    <div style={{ marginBottom: '16px' }}>
                        <div className="debug-section-title">
                            AI Status
                        </div>

                        <div className="debug-row">
                            <span>Mode</span>
                            <span style={{ color: useV2AI ? '#ffffff' : '#888' }}>{useV2AI ? 'V2 FSM' : 'V1 Simple'}</span>
                        </div>

                        {useV2AI && (
                            <div className="debug-row">
                                <span>State</span>
                                <span style={{
                                    color: stateColors[enemyAIState] || '#fff',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase'
                                }}>
                                    {enemyAIState}
                                </span>
                            </div>
                        )}

                        <div className="debug-row">
                            <span>Distance</span>
                            <span style={{ color: distance < 10 ? '#ff4444' : '#fff' }}>
                                {distance.toFixed(1)}u
                            </span>
                        </div>
                    </div>

                    <div className="debug-divider" />

                    {/* Section: Toggles */}
                    <div style={{ marginBottom: '8px' }}>
                        <div className="debug-section-title">
                            Audio Debug
                        </div>

                        {/* Audio Debug Toggle */}
                        <div className="debug-row" style={{ alignItems: 'center' }}>
                            <span>Sonar Visuals</span>
                            <button
                                onClick={() => setAudioDebugMode({
                                    closingEnabled: !audioDebugMode.closingEnabled,
                                    openingEnabled: !audioDebugMode.openingEnabled
                                })}
                                style={{
                                    background: (audioDebugMode.closingEnabled || audioDebugMode.openingEnabled) ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                    border: (audioDebugMode.closingEnabled || audioDebugMode.openingEnabled) ? '1px solid #ffffff' : '1px solid #444',
                                    color: (audioDebugMode.closingEnabled || audioDebugMode.openingEnabled) ? '#ffffff' : '#888',
                                    borderRadius: '4px',
                                    padding: '2px 8px',
                                    fontSize: '10px',
                                    cursor: 'pointer',
                                    minWidth: '40px'
                                }}
                            >
                                {(audioDebugMode.closingEnabled || audioDebugMode.openingEnabled) ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    </div>

                    <div className="debug-divider" />

                    {/* Section: Play-Feel presets (one-click feel bundles) */}
                    <div style={{ marginBottom: '12px' }}>
                        <div className="debug-section-title">
                            Play-Feel
                        </div>
                        <div className="debug-row" style={{ alignItems: 'center' }}>
                            <span>Preset</span>
                            <select
                                value={playfeelPreset}
                                onChange={(e) => {
                                    if (e.target.value !== 'custom') {
                                        applyPlayfeelPreset(e.target.value as Parameters<typeof applyPlayfeelPreset>[0])
                                    }
                                }}
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid #444',
                                    color: '#fff',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                }}
                            >
                                {Object.entries(PLAYFEEL_PRESETS).map(([key, p]) => (
                                    <option key={key} value={key}>{p.label}</option>
                                ))}
                                <option value="custom" disabled>Custom (edited)</option>
                            </select>
                        </div>
                        <div style={{ fontSize: '9px', color: '#888', marginTop: '4px', lineHeight: 1.4 }}>
                            {playfeelPreset === 'custom'
                                ? 'Custom — tweaked from a preset.'
                                : PLAYFEEL_PRESETS[playfeelPreset]?.blurb}
                            {' '}Sets physics + drift + downhill + jump + enemy speed. Physics change resets the round.
                        </div>
                    </div>

                    <div className="debug-divider" />

                    {/* Section: Physics Feel (traction A/B — applies on rebuild) */}
                    <div style={{ marginBottom: '12px' }}>
                        <div className="debug-section-title">
                            Physics Feel
                        </div>
                        <div className="debug-row" style={{ alignItems: 'center' }}>
                            <span>Preset</span>
                            <select
                                value={physicsPreset}
                                onChange={(e) => setSetting('physicsPreset', e.target.value as typeof physicsPreset)}
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid #444',
                                    color: '#fff',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="current">Current (baseline)</option>
                                <option value="frictionOnly">A · Friction only</option>
                                <option value="v1Gravity">B · v1 gravity</option>
                                <option value="blend">C · Blend</option>
                            </select>
                        </div>
                        <div style={{ fontSize: '9px', color: '#888', marginTop: '4px', lineHeight: 1.4 }}>
                            Changing rebuilds the arena (resets the round). Gravity + jump affect both models; friction only bites the torque model.
                        </div>
                    </div>

                    <div className="debug-divider" />

                    {/* Section: Movement Model (Known #4 fix — live A/B, no rebuild) */}
                    <div style={{ marginBottom: '12px' }}>
                        <div className="debug-section-title">
                            Movement Model
                        </div>
                        <div className="debug-row" style={{ alignItems: 'center' }}>
                            <span>Model</span>
                            <select
                                value={movementModel}
                                onChange={(e) => setSetting('movementModel', e.target.value as typeof movementModel)}
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid #444',
                                    color: '#fff',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="velocity">Velocity (1:1 roll)</option>
                                <option value="torque">Torque (legacy)</option>
                            </select>
                        </div>
                        <div style={{ fontSize: '9px', color: '#888', marginTop: '4px', lineHeight: 1.4 }}>
                            Live toggle (no rebuild). Velocity = drive the ball directly, spin follows motion. Torque = old wheel-spin model.
                        </div>

                        {/* Enemy movement model — mirrors the player's velocity drive */}
                        <div className="debug-row" style={{ alignItems: 'center', marginTop: '8px' }}>
                            <span>Enemy</span>
                            <select
                                value={enemyMovementModel}
                                onChange={(e) => setSetting('enemyMovementModel', e.target.value as typeof enemyMovementModel)}
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid #444',
                                    color: '#fff',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="velocity">Velocity (same as player)</option>
                                <option value="force">Force (legacy)</option>
                            </select>
                        </div>
                    </div>

                    <div className="debug-divider" />

                    {/* Section: Feel Tuning (velocity model — all live, no rebuild) */}
                    <div style={{ marginBottom: '12px' }}>
                        <div className="debug-section-title">
                            Feel Tuning
                        </div>

                        {/* Drift / glide on release */}
                        <div className="debug-row" style={{ alignItems: 'center' }}>
                            <span>Drift</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}>{playerDrift.toFixed(2)}</span>
                        </div>
                        <input
                            type="range" min={0} max={1} step={0.05} value={playerDrift}
                            onChange={(e) => setSetting('playerDrift', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />

                        {/* Downhill roll strength */}
                        <div className="debug-row" style={{ alignItems: 'center', marginTop: '6px' }}>
                            <span>Downhill Roll</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}>{downhillRoll.toFixed(2)}</span>
                        </div>
                        <input
                            type="range" min={0} max={1} step={0.05} value={downhillRoll}
                            onChange={(e) => setSetting('downhillRoll', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />

                        {/* Jump apex height (u) */}
                        <div className="debug-row" style={{ alignItems: 'center', marginTop: '6px' }}>
                            <span>Jump Height</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}>{jumpHeight.toFixed(1)}u</span>
                        </div>
                        <input
                            type="range" min={0.5} max={5} step={0.1} value={jumpHeight}
                            onChange={(e) => setSetting('jumpHeight', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />

                        <div style={{ fontSize: '9px', color: '#888', marginTop: '4px', lineHeight: 1.4 }}>
                            Drift = glide/inertia on release. Downhill Roll = how hard gravity pulls the ball down slopes when idle. Jump Height = apex in units (~1.8 clears the enemy ball).
                        </div>
                    </div>

                    {/* Coordinates */}
                    <div className="debug-coordinates">
                        <div>P: {playerPosition.x.toFixed(1)}, {playerPosition.y.toFixed(1)}, {playerPosition.z.toFixed(1)}</div>
                        <div>E: {enemyPosition.x.toFixed(1)}, {enemyPosition.y.toFixed(1)}, {enemyPosition.z.toFixed(1)}</div>
                    </div>
                </div>
            )}
        </div>
    )
}
