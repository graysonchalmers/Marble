import { useState } from 'react'
import { useGameStore } from '../../store/useGameStore'

export function UnifiedDebugMenu() {
    const useV2AI = useGameStore(s => s.useV2AI)
    const enemyAIState = useGameStore(s => s.enemyAIState)
    const playerPosition = useGameStore(s => s.playerPosition)
    const enemyPosition = useGameStore(s => s.enemyPosition)
    const perfStats = useGameStore(s => s.perfStats)
    const audioDebugMode = useGameStore(s => s.audioDebugMode)
    const setAudioDebugMode = (val: { closingEnabled: boolean, openingEnabled: boolean }) => useGameStore.setState({ audioDebugMode: val })
    const physicsPreset = useGameStore(s => s.physicsPreset)
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
                            Changing rebuilds the arena (resets the round). Fixes ground traction — Known #4.
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
