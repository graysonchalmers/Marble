import { useState } from 'react'
import { useSettings } from './SettingsContext'

export function UnifiedDebugMenu() {
    const {
        useV2AI,
        enemyAIState,
        playerPosition,
        enemyPosition,
        perfStats, // { fps, cpu, gpu }
        audioDebugMode,
        setAudioDebugMode
    } = useSettings()

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
        <div style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            zIndex: 1000,
            fontFamily: "'JetBrains Mono', 'Consolas', monospace",
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '8px'
        }}>
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: 'rgba(15, 15, 20, 0.8)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: isOpen ? '#ffffff' : '#888',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    transition: 'all 0.2s'
                }}
            >
                <span style={{ fontSize: '14px' }}>{isOpen ? '▼' : '▶'}</span>
                DEV TOOLS
            </button>

            {/* Menu Content */}
            {isOpen && (
                <div style={{
                    background: 'rgba(10, 10, 12, 0.95)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '16px',
                    width: '240px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    color: '#ccc',
                    fontSize: '11px'
                }}>
                    {/* Section: Perf Stats */}
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{
                            textTransform: 'uppercase',
                            color: '#666',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            marginBottom: '6px',
                            letterSpacing: '0.5px'
                        }}>
                            Performance
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '12px' }}>
                            <span style={{ color: '#fff' }}>FPS</span>
                            <span style={{ color: perfStats.fps < 30 ? '#ff4444' : '#fff' }}>{perfStats.fps}</span>
                        </div>
                        {/* 
                           Note: true extraction of GPU ms requires r3f-perf or Gl usage.
                           Currently placeholder or simple Delta if we implemented it in PerfBridge.
                           We'll show what we have.
                        */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '12px', opacity: 0.5 }}>
                            <span style={{ color: '#aaa' }}>GPU</span>
                            <span>-- ms</span>
                        </div>
                    </div>

                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', marginBottom: '16px' }} />

                    {/* Section: AI Status */}
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{
                            textTransform: 'uppercase',
                            color: '#666',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            marginBottom: '8px',
                            letterSpacing: '0.5px'
                        }}>
                            AI Status
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span>Mode</span>
                            <span style={{ color: useV2AI ? '#ffffff' : '#888' }}>{useV2AI ? 'V2 FSM' : 'V1 Simple'}</span>
                        </div>

                        {useV2AI && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
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

                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Distance</span>
                            <span style={{ color: distance < 10 ? '#ff4444' : '#fff' }}>
                                {distance.toFixed(1)}u
                            </span>
                        </div>
                    </div>

                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', marginBottom: '16px' }} />

                    {/* Section: Toggles */}
                    <div style={{ marginBottom: '8px' }}>
                        <div style={{
                            textTransform: 'uppercase',
                            color: '#666',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            marginBottom: '8px',
                            letterSpacing: '0.5px'
                        }}>
                            Audio Debug
                        </div>

                        {/* Audio Debug Toggle */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                    <div style={{ marginTop: '16px', fontSize: '9px', color: '#555', fontFamily: 'monospace' }}>
                        <div>P: {playerPosition.x.toFixed(1)}, {playerPosition.y.toFixed(1)}, {playerPosition.z.toFixed(1)}</div>
                        <div>E: {enemyPosition.x.toFixed(1)}, {enemyPosition.y.toFixed(1)}, {enemyPosition.z.toFixed(1)}</div>
                    </div>
                </div>
            )}
        </div>
    )
}
