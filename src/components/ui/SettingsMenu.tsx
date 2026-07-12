import { useState, useRef } from 'react'
import { useGameStore } from '../../store/useGameStore'
import { PLAYFEEL_PRESETS } from '../../systems/sim/tuning'

const COLORS = {
    primary: '#ffffff', // White (Clean)
    muted: '#666666',   // Gray
    light: '#ffffff',   // White
    bg: 'rgba(10, 10, 12, 0.95)',
    glass: 'rgba(255, 255, 255, 0.05)'
}

function Tooltip({ text }: { text: string }) {
    const [visible, setVisible] = useState(false)
    return (
        <span
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
            className="settings-tooltip-icon"
        >
            ⓘ
            {visible && (
                <div className="settings-tooltip-box">
                    {text}
                    <div className="settings-tooltip-caret" />
                </div>
            )}
        </span>
    )
}

function Slider({ label, value, onChange, min, max, step, color = COLORS.primary, tooltip }: any) {
    return (
        <div className="slider-container">
            <label className="slider-header">
                <span className="slider-label">{label} {tooltip && <Tooltip text={tooltip} />}</span>
                <span className="slider-value" style={{ color: color }}>{Math.round(value * 100) / 100}</span>
            </label>
            <div className="slider-input-wrapper">
                <input
                    type="range"
                    aria-label={label}
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="slider-input"
                    style={{ accentColor: color }}
                />
            </div>
        </div>
    )
}


function Toggle({ label, value, onChange }: any) {
    return (
        <div className="toggle-container">
            <span className="toggle-label">{label}</span>
            <button
                aria-label={label}
                onClick={() => onChange(!value)}
                className="toggle-button"
                style={{
                    background: value ? `${COLORS.primary}20` : 'rgba(255, 255, 255, 0.05)',
                    color: value ? COLORS.primary : '#888',
                    border: value ? `1px solid ${COLORS.primary}` : '1px solid #444',
                }}
            >
                {value ? 'ON' : 'OFF'}
            </button>
        </div>
    )
}

function Select({ label, value, onChange, options }: { label: string, value: string, onChange: (v: string) => void, options: { value: string, label: string }[] }) {
    return (
        <div style={{ marginBottom: '12px' }}>
            <span className="select-label">{label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)} className="select-input">
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    )
}

function ColorPicker({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) {
    return (
        <div className="color-picker-container">
            <span className="color-picker-label">{label}</span>
            <div className="color-picker-value-wrapper">
                <span className="color-picker-hex">{value}</span>
                <input
                    type="color"
                    aria-label={label}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="color-picker-input"
                />
            </div>
        </div>
    )
}

function CollapsibleSection({ title, isOpen, onToggle, children }: { title: string, isOpen: boolean, onToggle: () => void, children: React.ReactNode }) {
    return (
        <div className="collapsible-container">
            <button
                onClick={onToggle}
                className="collapsible-header"
                style={{ borderBottom: isOpen ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
            >
                {title}
                <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
            </button>
            {isOpen && (
                <div className="collapsible-content">
                    {children}
                </div>
            )}
        </div>
    )
}

export function SettingsMenu() {
    const store = useGameStore()

    const exportSettings = () => {
        const toExport = JSON.parse(localStorage.getItem('MARBLE_GAME_SETTINGS_V2') || '{}')
        const blob = new Blob([JSON.stringify(toExport, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `marble_settings_${new Date().toISOString().split('T')[0]}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    const importSettings = (file: File) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target?.result as string)
                store.setSettings(parsed)
            } catch (err) {
                console.error("Failed to parse settings", err)
            }
        }
        reader.readAsText(file)
    }

    // Proxy: reading `setFoo` returns a setter that calls setSetting('foo', v); reading `foo`
    // returns the live store value. Real store methods (setSettings, applyPlayfeelPreset,
    // loadGraphicsPreset, setSectionState, setIsPaused) are passed straight through.
    const proxy = new Proxy(store, {
        get(target, prop: string) {
            if (prop.startsWith('set') && prop !== 'setSetting' && prop !== 'setSectionState' && prop !== 'setIsPaused' && prop !== 'setSettings') {
                const key = prop.charAt(3).toLowerCase() + prop.slice(4)
                return (val: any) => target.setSetting(key as any, val)
            }
            return (target as any)[prop]
        }
    })

    const {
        // Player movement (velocity model — all live, no rebuild)
        moveTopSpeed, setMoveTopSpeed,
        moveAccel, setMoveAccel,
        moveBrakeDecel, setMoveBrakeDecel,
        moveAirControl, setMoveAirControl,
        jumpHeight, setJumpHeight,
        playerDrift, setPlayerDrift,
        downhillRoll, setDownhillRoll,
        // Enemy (live drive + rebuild-baked size/weight)
        enemySpeed, setEnemySpeed,
        enemyVelUnit, setEnemyVelUnit,
        enemyVelAccel, setEnemyVelAccel,
        enemyAirControl, setEnemyAirControl,
        enemySize, setEnemySize,
        enemyMass, setEnemyMass,
        // Physics feel (gravity lever) + one-click play-feel bundles
        physicsPreset, setPhysicsPreset,
        playfeelPreset, applyPlayfeelPreset,
        // Environment (baked at construction — now rebuilds live)
        cubeCount, setCubeCount,
        cubeScale, setCubeScale,
        columnCount, setColumnCount,
        columnSize, setColumnSize,
        columnHeight, setColumnHeight,
        propCount, setPropCount,
        terrainRoughness, setTerrainRoughness,
        crumbleCount, setCrumbleCount,
        columnsCrumble, setColumnsCrumble,
        // Camera + graphics
        cameraStiffness, setCameraStiffness,
        cameraOffset, setCameraOffset,
        shadowsEnabled, setShadowsEnabled,
        graphicsPreset, loadGraphicsPreset,
        // Visuals
        occlusionMode, setOcclusionMode,
        groundGridSize, setGroundGridSize,
        groundColorBg, setGroundColorBg,
        groundColorGrid, setGroundColorGrid,
        cubeGridSize, setCubeGridSize,
        cubeColorBg, setCubeColorBg,
        cubeColorGrid, setCubeColorGrid,
        uiAccentColor, setUiAccentColor,
        // Audio
        soundEnabled, setSoundEnabled,
        masterVolume, setMasterVolume,
        audioPitchEnabled, setAudioPitchEnabled,
        audioRateEnabled, setAudioRateEnabled,
        audioClosingVolume, setAudioClosingVolume,
        audioOpeningVolume, setAudioOpeningVolume,
        audioPingVolume, setAudioPingVolume,
        audioToneVolume, setAudioToneVolume,
        audioPingStyle, setAudioPingStyle,
        audioToneStyle, setAudioToneStyle,
        audioClosingMaxDist, setAudioClosingMaxDist,
        audioOpeningMaxDist, setAudioOpeningMaxDist,
        audioClosingPitch, setAudioClosingPitch,
        audioOpeningPitch, setAudioOpeningPitch,
        audioSolidDistance, setAudioSolidDistance,
        audioPitchModulation, setAudioPitchModulation,
        // UI / shell
        controlsOpen, setControlsOpen,
        sectionStates, setSectionState,
        setIsPaused,
    } = proxy as any

    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleImportClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            importSettings(file)
            e.target.value = ''
        }
    }

    const toggleSettings = () => {
        const newState = !controlsOpen
        setControlsOpen(newState)
        setIsPaused(newState)
    }

    return (
        <div className="settings-panel-wrapper">
            <button
                onClick={toggleSettings}
                className="settings-toggle-btn"
            >
                <span style={{ fontSize: '16px' }}>⚙️</span>
                {controlsOpen ? 'Hide Controls' : 'Show Controls'}
            </button>

            {controlsOpen && (
                <div className="settings-panel-content">
                    <CollapsibleSection
                        title="🎮 Gameplay"
                        isOpen={sectionStates['gameplay']}
                        onToggle={() => setSectionState('gameplay', !sectionStates['gameplay'])}
                    >
                        <Select
                            label="Play-Feel Preset"
                            value={playfeelPreset}
                            onChange={(v) => { if (v !== 'custom') applyPlayfeelPreset(v) }}
                            options={[
                                ...Object.entries(PLAYFEEL_PRESETS).map(([key, p]: any) => ({ value: key, label: p.label })),
                                { value: 'custom', label: 'Custom (edited)' },
                            ]}
                        />
                        <p style={{ fontSize: '10px', color: '#666', marginTop: '-4px', marginBottom: '10px' }}>
                            One-click feel bundle (physics + drift + downhill + jump + enemy speed). Tweaking any knob below flips it to Custom.
                        </p>

                        <div className="section-subtitle">Player</div>
                        <Slider label="Top Speed" value={moveTopSpeed} onChange={setMoveTopSpeed} min={5} max={40} step={1} color={COLORS.primary} tooltip="Horizontal top speed (u/s)." />
                        <Slider label="Acceleration" value={moveAccel} onChange={setMoveAccel} min={10} max={150} step={5} color={COLORS.primary} tooltip="How snappily the ball reaches top speed / changes direction." />
                        <Slider label="Brake Decel" value={moveBrakeDecel} onChange={setMoveBrakeDecel} min={10} max={200} step={5} color={COLORS.primary} tooltip="Deceleration while holding Shift (brake)." />
                        <Slider label="Jump Height" value={jumpHeight} onChange={setJumpHeight} min={0.5} max={5} step={0.1} color={COLORS.primary} tooltip="Jump apex in units (~1.8 clears the enemy ball)." />
                        <Slider label="Air Control" value={moveAirControl} onChange={setMoveAirControl} min={0} max={1} step={0.05} color={COLORS.primary} tooltip="Midair steering authority (fraction of accel)." />
                        <Slider label="Drift / Glide" value={playerDrift} onChange={setPlayerDrift} min={0} max={1} step={0.05} color={COLORS.primary} tooltip="Coast/inertia on release: 0 = snappy stop, 1 = long floaty glide." />
                        <Slider label="Downhill Roll" value={downhillRoll} onChange={setDownhillRoll} min={0} max={1} step={0.05} color={COLORS.primary} tooltip="How hard gravity pulls the idle ball down slopes." />

                        <div style={{ height: '10px' }} />
                        <div className="section-subtitle">Enemy</div>
                        <Slider label="Enemy Speed" value={enemySpeed} onChange={setEnemySpeed} min={0.5} max={5} step={0.1} color={uiAccentColor} tooltip="Difficulty multiplier on the enemy's chase speed." />
                        <Slider label="Enemy Reach" value={enemyVelUnit} onChange={setEnemyVelUnit} min={2} max={14} step={0.5} color={uiAccentColor} tooltip="Enemy top-speed unit — chase speed = Enemy Speed × Reach." />
                        <Slider label="Enemy Accel" value={enemyVelAccel} onChange={setEnemyVelAccel} min={10} max={100} step={5} color={uiAccentColor} tooltip="How fast the enemy reaches its target velocity." />
                        <Slider label="Enemy Air Control" value={enemyAirControl} onChange={setEnemyAirControl} min={0} max={1} step={0.05} color={uiAccentColor} />
                        <Slider label="Enemy Size" value={enemySize} onChange={setEnemySize} min={0.2} max={3.0} step={0.1} color={uiAccentColor} tooltip="Rebuilds the round when changed." />
                        <Slider label="Enemy Weight" value={enemyMass} onChange={setEnemyMass} min={0.1} max={10.0} step={0.1} color={uiAccentColor} tooltip="Rebuilds the round when changed." />
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="⚛️ Physics"
                        isOpen={sectionStates['physics']}
                        onToggle={() => setSectionState('physics', !sectionStates['physics'])}
                    >
                        <Select
                            label="Physics Feel (gravity)"
                            value={physicsPreset}
                            onChange={(v) => setPhysicsPreset(v)}
                            options={[
                                { value: 'current', label: 'Light · low gravity' },
                                { value: 'v1Gravity', label: 'Heavy · v1 gravity' },
                                { value: 'blend', label: 'Blend · default' },
                            ]}
                        />
                        <p style={{ fontSize: '10px', color: '#666', marginTop: '-4px' }}>
                            Gravity is the live lever under the velocity model (drives fall speed, jump rescale, downhill roll). Changing it rebuilds the arena (resets the round).
                        </p>
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="🌳 Environment"
                        isOpen={sectionStates['environment']}
                        onToggle={() => setSectionState('environment', !sectionStates['environment'])}
                    >
                        <p style={{ fontSize: '10px', color: '#666', marginBottom: '8px' }}>Applies live — resets the round (layout stays put, only the changed dimension updates).</p>
                        <Slider label="Box Count" value={cubeCount} onChange={setCubeCount} min={0} max={100} step={1} color={COLORS.muted} />
                        <Slider label="Box Size" value={cubeScale} onChange={setCubeScale} min={0.5} max={10} step={0.5} color={COLORS.muted} />
                        <div style={{ height: '10px' }} />
                        <Slider label="Column Count" value={columnCount} onChange={setColumnCount} min={0} max={40} step={1} color={COLORS.muted} />
                        <Slider label="Column Size" value={columnSize} onChange={setColumnSize} min={0.5} max={8} step={0.5} color={COLORS.muted} />
                        <Slider label="Column Height" value={columnHeight} onChange={setColumnHeight} min={2} max={30} step={1} color={COLORS.muted} />
                        <Toggle label="Destructible Columns" value={columnsCrumble} onChange={setColumnsCrumble} />

                        <div style={{ height: '10px' }} />
                        <Slider label="Loose Props" value={propCount} onChange={setPropCount} min={0} max={80} step={1} color={COLORS.muted} tooltip="Scattered dynamic chunks that get knocked around as you play. 0 = off." />
                        <Slider label="Floor Roughness" value={terrainRoughness} onChange={setTerrainRoughness} min={0} max={1.5} step={0.1} color={COLORS.muted} tooltip="Bumpy patches that are harder for you and the enemy to cross. 0 = smooth." />
                        <Slider label="Crumble Blocks" value={crumbleCount} onChange={setCrumbleCount} min={0} max={40} step={1} color={COLORS.muted} tooltip="Crashable blocks that shatter into rolling debris when you (or the enemy) plow through at speed. 0 = off." />
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="🔊 Advanced Audio"
                        isOpen={sectionStates['audio']}
                        onToggle={() => setSectionState('audio', !sectionStates['audio'])}
                    >
                        <Toggle label="Audio Enabled" value={soundEnabled} onChange={setSoundEnabled} />
                        <div style={{ height: 8 }} />
                        <Slider label="Master Volume" value={masterVolume} onChange={setMasterVolume} min={0} max={1} step={0.05} color={COLORS.primary} />

                        <div className="section-subtitle">Behaviors (Dynamic)</div>
                        <Toggle label="Dynamic Pitch (Distance)" value={audioPitchEnabled} onChange={setAudioPitchEnabled} />
                        <Toggle label="Dynamic Rate (Velocity)" value={audioRateEnabled} onChange={setAudioRateEnabled} />

                        <div style={{ marginBottom: '8px' }}>
                            <Slider label="Solid Tone Dist" value={audioSolidDistance} onChange={setAudioSolidDistance} min={1} max={50} step={1} color={uiAccentColor} />
                            <Slider label="Pitch Mod (x)" value={audioPitchModulation} onChange={setAudioPitchModulation} min={0} max={20} step={0.5} color={COLORS.light} />
                        </div>

                        <div className="section-subtitle">Closing State (Red)</div>
                        <Slider label="Volume" value={audioClosingVolume} onChange={setAudioClosingVolume} min={0} max={2} step={0.1} color={uiAccentColor} />
                        <Slider label="Max Distance" value={audioClosingMaxDist} onChange={setAudioClosingMaxDist} min={10} max={500} step={10} color={uiAccentColor} />
                        <Slider label="Base Pitch" value={audioClosingPitch} onChange={setAudioClosingPitch} min={10} max={1000} step={10} color={uiAccentColor} />

                        <div className="section-subtitle">Opening State (Green)</div>
                        <Slider label="Volume" value={audioOpeningVolume} onChange={setAudioOpeningVolume} min={0} max={1} step={0.1} color={COLORS.primary} />
                        <Slider label="Max Distance" value={audioOpeningMaxDist} onChange={setAudioOpeningMaxDist} min={10} max={500} step={10} color={COLORS.primary} />
                        <Slider label="Base Pitch" value={audioOpeningPitch} onChange={setAudioOpeningPitch} min={10} max={1000} step={10} color={COLORS.primary} />

                        <div className="section-subtitle">Global Mix</div>
                        <Slider label="Ping Vol" value={audioPingVolume} onChange={setAudioPingVolume} min={0} max={1} step={0.1} color={COLORS.light} />
                        <Slider label="Tone Vol (Solid)" value={audioToneVolume} onChange={setAudioToneVolume} min={0} max={1} step={0.1} color={COLORS.light} />

                        <div className="section-subtitle">Styles</div>
                        <div style={{ marginBottom: '8px' }}>
                            <span className="select-label">Ping Waveform</span>
                            <select value={audioPingStyle} onChange={(e) => setAudioPingStyle(e.target.value as any)} className="select-input">
                                <option value="sine">Sine (Smooth)</option>
                                <option value="square">Square (Retro)</option>
                                <option value="triangle">Triangle (Soft)</option>
                                <option value="sawtooth">Sawtooth (Harsh)</option>
                            </select>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <span className="select-label">Tone Waveform</span>
                            <select value={audioToneStyle} onChange={(e) => setAudioToneStyle(e.target.value as any)} className="select-input">
                                <option value="sine">Sine (Smooth)</option>
                                <option value="square">Square (Retro)</option>
                                <option value="triangle">Triangle (Soft)</option>
                                <option value="sawtooth">Sawtooth (Harsh)</option>
                            </select>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="🎨 Visuals"
                        isOpen={sectionStates['visuals']}
                        onToggle={() => setSectionState('visuals', !sectionStates['visuals'])}
                    >
                        <Select
                            label="See-Through Obstacles"
                            value={occlusionMode}
                            onChange={(v) => setOcclusionMode(v)}
                            options={[
                                { value: 'ghost', label: 'Ghost (transparent)' },
                                { value: 'wireframe', label: 'Wireframe (edges only)' },
                                { value: 'xray', label: 'X-Ray (back faces)' },
                                { value: 'silhouette', label: 'Silhouette (tinted)' },
                                { value: 'off', label: 'Off (stay solid)' },
                            ]}
                        />
                        <p style={{ fontSize: '10px', color: '#666', marginTop: '-4px', marginBottom: '10px' }}>
                            How obstacles between the camera and your ball are revealed so you're never hidden.
                        </p>

                        <div className="section-subtitle">Ground</div>
                        <Slider label="Grid Size" value={groundGridSize} onChange={setGroundGridSize} min={16} max={256} step={16} color={COLORS.muted} />
                        <ColorPicker label="Background" value={groundColorBg} onChange={setGroundColorBg} />
                        <ColorPicker label="Grid Lines" value={groundColorGrid} onChange={setGroundColorGrid} />

                        <div style={{ height: '12px' }} />
                        <div className="section-subtitle">Interface Theme</div>
                        <ColorPicker label="Accent Color" value={uiAccentColor} onChange={setUiAccentColor} />

                        <div style={{ height: '12px' }} />
                        <div className="section-subtitle">Obstacles</div>
                        <Slider label="Grid Size" value={cubeGridSize} onChange={setCubeGridSize} min={64} max={512} step={32} color={COLORS.muted} />
                        <ColorPicker label="Background" value={cubeColorBg} onChange={setCubeColorBg} />
                        <ColorPicker label="Grid Lines" value={cubeColorGrid} onChange={setCubeColorGrid} />
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="📷 Camera & Graphics"
                        isOpen={sectionStates['graphics']}
                        onToggle={() => setSectionState('graphics', !sectionStates['graphics'])}
                    >
                        <Slider label="Cam Stiffness" value={cameraStiffness} onChange={setCameraStiffness} min={1} max={20} step={0.5} color={COLORS.light} tooltip="How tightly the camera tracks the ball." />
                        <Slider label="Cam Distance" value={cameraOffset} onChange={setCameraOffset} min={5} max={30} step={1} color={COLORS.light} tooltip="Follow-camera distance/height." />

                        <div style={{ height: '10px' }} />
                        <div className="section-subtitle">Render</div>
                        <Select
                            label="Graphics Quality"
                            value={graphicsPreset}
                            onChange={(v) => loadGraphicsPreset(v)}
                            options={[
                                { value: 'low', label: 'Low (Fastest)' },
                                { value: 'medium', label: 'Medium (Balanced)' },
                                { value: 'high', label: 'High' },
                                { value: 'ultra', label: 'Ultra (Maximum)' },
                                { value: 'custom', label: 'Custom (Modified)' },
                            ]}
                        />
                        <Toggle label="Shadows" value={shadowsEnabled} onChange={setShadowsEnabled} />
                    </CollapsibleSection>

                    <div style={{ marginTop: '16px' }}>
                        <div className="export-import-container">
                            <button onClick={handleImportClick} className="import-btn">
                                IMPORT JSON
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                            <button onClick={exportSettings} className="export-btn">
                                EXPORT JSON
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
