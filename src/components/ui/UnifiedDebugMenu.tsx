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
                        {/* 
                           Note: true extraction of GPU ms requires r3f-perf or Gl usage.
                           Currently placeholder or simple Delta if we implemented it in PerfBridge.
                           We'll show what we have.
                        */}
                        <div className="debug-row" style={{ opacity: 0.5 }}>
                            <span style={{ color: '#aaa' }}>GPU</span>
                            <span>-- ms</span>
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
