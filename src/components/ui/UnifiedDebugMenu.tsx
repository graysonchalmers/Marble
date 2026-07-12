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
    const playerDrift = useGameStore(s => s.playerDrift)
    const downhillRoll = useGameStore(s => s.downhillRoll)
    const jumpHeight = useGameStore(s => s.jumpHeight)
    const enemySpeed = useGameStore(s => s.enemySpeed)
    const moveTopSpeed = useGameStore(s => s.moveTopSpeed)
    const moveAccel = useGameStore(s => s.moveAccel)
    const moveBrakeDecel = useGameStore(s => s.moveBrakeDecel)
    const moveAirControl = useGameStore(s => s.moveAirControl)
    const enemyVelUnit = useGameStore(s => s.enemyVelUnit)
    const enemyVelAccel = useGameStore(s => s.enemyVelAccel)
    const playfeelPreset = useGameStore(s => s.playfeelPreset)
    const applyPlayfeelPreset = useGameStore(s => s.applyPlayfeelPreset)
    const setSetting = useGameStore(s => s.setSetting)
    // Clutter (Phase P) — scale or kill the loose props + crumble blocks live.
    const propCount = useGameStore(s => s.propCount)
    const crumbleCount = useGameStore(s => s.crumbleCount)

    // Default to CLOSED (minimized) — the panel is bottom-left and opens upward on click,
    // so it doesn't blanket the play area on load (Grayson: "minimize it by default").
    const [isOpen, setIsOpen] = useState(false)

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
                                <option value="current">Light · low gravity</option>
                                <option value="v1Gravity">Heavy · v1 gravity</option>
                                <option value="blend">Blend · default</option>
                            </select>
                        </div>
                        <div style={{ fontSize: '9px', color: '#888', marginTop: '4px', lineHeight: 1.4 }}>
                            Changing rebuilds the arena (resets the round). Gravity + jump are the live levers under the velocity model; the friction fields are now largely vestigial (velocity control overrides grounded traction).
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

                    <div className="debug-divider" />

                    {/* Section: Movement Tuning (velocity drive — all live, no rebuild) */}
                    <div style={{ marginBottom: '12px' }}>
                        <div className="debug-section-title">
                            Movement Tuning
                        </div>

                        {/* Player top speed */}
                        <div className="debug-row" style={{ alignItems: 'center' }}>
                            <span>Top Speed</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}>{moveTopSpeed.toFixed(0)} u/s</span>
                        </div>
                        <input
                            type="range" min={5} max={40} step={1} value={moveTopSpeed}
                            onChange={(e) => setSetting('moveTopSpeed', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />

                        {/* Player accel */}
                        <div className="debug-row" style={{ alignItems: 'center', marginTop: '6px' }}>
                            <span>Accel</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}>{moveAccel.toFixed(0)}</span>
                        </div>
                        <input
                            type="range" min={10} max={150} step={5} value={moveAccel}
                            onChange={(e) => setSetting('moveAccel', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />

                        {/* Player brake decel */}
                        <div className="debug-row" style={{ alignItems: 'center', marginTop: '6px' }}>
                            <span>Brake Decel</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}>{moveBrakeDecel.toFixed(0)}</span>
                        </div>
                        <input
                            type="range" min={10} max={200} step={5} value={moveBrakeDecel}
                            onChange={(e) => setSetting('moveBrakeDecel', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />

                        {/* Player air control */}
                        <div className="debug-row" style={{ alignItems: 'center', marginTop: '6px' }}>
                            <span>Air Control</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}>{moveAirControl.toFixed(2)}</span>
                        </div>
                        <input
                            type="range" min={0} max={1} step={0.05} value={moveAirControl}
                            onChange={(e) => setSetting('moveAirControl', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />

                        <div style={{ height: '1px', background: '#333', margin: '10px 0' }} />

                        {/* Enemy speed multiplier (difficulty) */}
                        <div className="debug-row" style={{ alignItems: 'center' }}>
                            <span>Enemy Speed</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}>{enemySpeed.toFixed(1)}×</span>
                        </div>
                        <input
                            type="range" min={0.5} max={5} step={0.1} value={enemySpeed}
                            onChange={(e) => setSetting('enemySpeed', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />

                        {/* Enemy reach speed (velUnit) */}
                        <div className="debug-row" style={{ alignItems: 'center', marginTop: '6px' }}>
                            <span>Enemy Reach</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}>{enemyVelUnit.toFixed(1)}</span>
                        </div>
                        <input
                            type="range" min={2} max={14} step={0.5} value={enemyVelUnit}
                            onChange={(e) => setSetting('enemyVelUnit', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />

                        {/* Enemy accel */}
                        <div className="debug-row" style={{ alignItems: 'center', marginTop: '6px' }}>
                            <span>Enemy Accel</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}>{enemyVelAccel.toFixed(0)}</span>
                        </div>
                        <input
                            type="range" min={10} max={100} step={5} value={enemyVelAccel}
                            onChange={(e) => setSetting('enemyVelAccel', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />

                        <div style={{ fontSize: '9px', color: '#888', marginTop: '4px', lineHeight: 1.4 }}>
                            Player: Top Speed / Accel (snappiness) / Brake Decel / midair Air Control. Enemy chase top speed = Enemy Speed × Reach. All live, no rebuild.
                        </div>
                    </div>

                    <div className="debug-divider" />

                    {/* Section: Clutter (Phase P) — loose props + crumble blocks. Wide ranges so you
                        can drastically crank or kill them; 0 = off. Rebuilds the arena on change. */}
                    <div style={{ marginBottom: '12px' }}>
                        <div className="debug-section-title">
                            Clutter
                        </div>

                        {/* Loose props (dust-bunny knock-around chunks) */}
                        <div className="debug-row" style={{ alignItems: 'center' }}>
                            <span>Loose Props</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}>{propCount === 0 ? 'off' : propCount}</span>
                        </div>
                        <input
                            type="range" min={0} max={80} step={1} value={propCount}
                            onChange={(e) => setSetting('propCount', parseInt(e.target.value, 10))}
                            style={{ width: '100%' }}
                        />

                        {/* Crumble blocks (crashable scenery that bursts into brick debris) */}
                        <div className="debug-row" style={{ alignItems: 'center', marginTop: '6px' }}>
                            <span>Crumble Blocks</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}>{crumbleCount === 0 ? 'off' : crumbleCount}</span>
                        </div>
                        <input
                            type="range" min={0} max={40} step={1} value={crumbleCount}
                            onChange={(e) => setSetting('crumbleCount', parseInt(e.target.value, 10))}
                            style={{ width: '100%' }}
                        />

                        <div style={{ fontSize: '9px', color: '#888', marginTop: '4px', lineHeight: 1.4 }}>
                            Loose Props = dust-bunny chunks you knock around. Crumble Blocks = crashable crates that shatter into brick debris. 0 = off. Changing either rebuilds the arena (resets the round).
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
