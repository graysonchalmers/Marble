import { useState, useRef } from 'react'
import { useSettings } from './SettingsContext'

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
            style={{
                position: 'relative',
                cursor: 'help',
                marginLeft: '4px',
                fontSize: '10px',
                verticalAlign: 'middle',
                opacity: 0.7
            }}
        >
            ⓘ
            {visible && (
                <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: '8px',
                    background: 'rgba(0,0,0,0.9)',
                    border: '1px solid #444',
                    padding: '8px',
                    borderRadius: '4px',
                    width: '150px',
                    color: '#fff',
                    zIndex: 1000,
                    pointerEvents: 'none',
                    textAlign: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    fontWeight: 'normal',
                    lineHeight: '1.2'
                }}>
                    {text}
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        marginLeft: '-4px',
                        borderWidth: '4px',
                        borderStyle: 'solid',
                        borderColor: 'black transparent transparent transparent'
                    }} />
                </div>
            )}
        </span>
    )
}

function Slider({ label, value, onChange, min, max, step, color = COLORS.primary, tooltip }: any) {
    return (
        <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', color: '#ccc', fontWeight: 500 }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>{label} {tooltip && <Tooltip text={tooltip} />}</span>
                <span style={{ color: color, fontWeight: 'bold', fontFamily: 'monospace' }}>{Math.round(value * 100) / 100}</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    style={{
                        flex: 1,
                        cursor: 'pointer',
                        accentColor: color,
                        height: '4px',
                        borderRadius: '2px'
                    }}
                />
            </div>
        </div>
    )
}


function Toggle({ label, value, onChange }: any) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#ccc', fontWeight: 500 }}>{label}</span>
            <button
                onClick={() => onChange(!value)}
                style={{
                    background: value ? `${COLORS.primary}20` : 'rgba(255, 255, 255, 0.05)',
                    color: value ? COLORS.primary : '#888',
                    border: value ? `1px solid ${COLORS.primary}` : '1px solid #444',
                    borderRadius: '12px',
                    padding: '2px 10px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    transition: 'all 0.2s',
                    minWidth: '40px'
                }}
            >
                {value ? 'ON' : 'OFF'}
            </button>
        </div>
    )
}

function ColorPicker({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#ccc', fontWeight: 500 }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#888' }}>{value}</span>
                <input
                    type="color"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    style={{
                        width: '32px',
                        height: '24px',
                        padding: 0,
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: 'none'
                    }}
                />
            </div>
        </div>
    )
}

function CollapsibleSection({ title, isOpen, onToggle, children }: { title: string, isOpen: boolean, onToggle: () => void, children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '16px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
            <button
                onClick={onToggle}
                style={{
                    width: '100%',
                    padding: '10px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.05)',
                    border: 'none',
                    borderBottom: isOpen ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    cursor: 'pointer',
                    textAlign: 'left'
                }}
            >
                {title}
                <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
            </button>
            {isOpen && (
                <div style={{ padding: '12px' }}>
                    {children}
                </div>
            )}
        </div>
    )
}

export function SettingsMenu() {
    const {
        jumpForce, setJumpForce,
        moveSpeed, setMoveSpeed,
        enemySpeed, setEnemySpeed,
        enemySize, setEnemySize,
        enemyMass, setEnemyMass,
        gravity, setGravity,
        friction, setFriction,
        restitution, setRestitution,
        worldScale, setWorldScale,
        cubeCount, setCubeCount,
        cubeScale, setCubeScale,
        soundEnabled, setSoundEnabled,
        physicsRate, setPhysicsRate,
        shadowsEnabled, setShadowsEnabled,
        pixelRatio, setPixelRatio,
        cameraStiffness, setCameraStiffness,
        cameraOffset, setCameraOffset,
        setIsPaused,
        useV2AI, setUseV2AI,
        playerAirControl, setPlayerAirControl,
        enemyAirControl, setEnemyAirControl,
        exportSettings, importSettings,
        controlsOpen, setControlsOpen,
        sectionStates, setSectionState,
        groundGridSize, setGroundGridSize,
        groundColorBg, setGroundColorBg,
        groundColorGrid, setGroundColorGrid,
        cubeGridSize, setCubeGridSize,
        cubeColorBg, setCubeColorBg,
        cubeColorGrid, setCubeColorGrid,

        // Audio
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
        uiAccentColor, setUiAccentColor
    } = useSettings()

    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleImportClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            importSettings(file)
            // Reset input so same file can be selected again if needed
            e.target.value = ''
        }
    }

    const toggleSettings = () => {
        const newState = !controlsOpen
        setControlsOpen(newState)
        setIsPaused(newState)
    }

    return (
        <div style={{
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 1000,
            fontFamily: "'Inter', sans-serif",
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            maxHeight: 'calc(100vh - 40px)'
        }}>
            <button
                onClick={toggleSettings}
                style={{
                    padding: '10px 20px',
                    background: 'rgba(15, 15, 20, 0.8)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '30px',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                    letterSpacing: '0.5px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    marginBottom: '10px',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}
            >
                <span style={{ fontSize: '16px' }}>⚙️</span>
                {controlsOpen ? 'Hide Controls' : 'Show Controls'}
            </button>

            {controlsOpen && (
                <div style={{
                    background: 'rgba(10, 10, 12, 0.95)',
                    backdropFilter: 'blur(20px)',
                    padding: '16px',
                    borderRadius: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    width: '300px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                    color: 'white',
                    overflowY: 'auto',
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(255,255,255,0.2) transparent'
                }}>
                    <CollapsibleSection
                        title="🎮 Gameplay"
                        isOpen={sectionStates['gameplay']}
                        onToggle={() => setSectionState('gameplay', !sectionStates['gameplay'])}
                    >
                        <Slider label="Move Speed" value={moveSpeed} onChange={setMoveSpeed} min={1} max={30} step={0.5} color={COLORS.primary} />
                        <Slider label="Jump Force" value={jumpForce} onChange={setJumpForce} min={1} max={30} step={0.5} color={COLORS.primary} />
                        <Slider label="Player Air Control" value={playerAirControl} onChange={setPlayerAirControl} min={0} max={1} step={0.05} color={COLORS.primary} />
                        <div style={{ height: '10px' }} />
                        <Toggle label="V2 Smart AI" value={useV2AI} onChange={setUseV2AI} />
                        <Slider label="Enemy Speed" value={enemySpeed} onChange={setEnemySpeed} min={1} max={20} step={0.5} color={uiAccentColor} />
                        <Slider label="Enemy Size" value={enemySize} onChange={setEnemySize} min={0.2} max={3.0} step={0.1} color={uiAccentColor} />
                        <Slider label="Enemy Weight" value={enemyMass} onChange={setEnemyMass} min={0.1} max={10.0} step={0.1} color={uiAccentColor} />
                        <Slider label="Enemy Air Control" value={enemyAirControl} onChange={setEnemyAirControl} min={0} max={1} step={0.05} color={uiAccentColor} />
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="⚛️ Physics"
                        isOpen={sectionStates['physics']}
                        onToggle={() => setSectionState('physics', !sectionStates['physics'])}
                    >
                        <Slider label="Gravity (Y)" value={gravity} onChange={setGravity} min={-40} max={-1} step={0.5} color={COLORS.muted} />
                        <Slider label="Bounciness" value={restitution} onChange={setRestitution} min={0} max={1.5} step={0.1} color={COLORS.muted} />
                        <Slider label="Friction" value={friction} onChange={setFriction} min={0} max={1} step={0.05} color={COLORS.muted} />
                        <Slider label="World Scale" value={worldScale} onChange={setWorldScale} min={0.25} max={4} step={0.25} color={COLORS.primary} tooltip="Adjusts relative gravity/speed feel: <1 = Giant Mode, >1 = Toy Mode" />
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="🌳 Environment"
                        isOpen={sectionStates['environment']}
                        onToggle={() => setSectionState('environment', !sectionStates['environment'])}
                    >
                        <p style={{ fontSize: '10px', color: '#666', marginBottom: '8px' }}>Requires Restart</p>
                        <Slider label="Box Count" value={cubeCount} onChange={setCubeCount} min={0} max={100} step={1} color={COLORS.muted} />
                        <Slider label="Box Size" value={cubeScale} onChange={setCubeScale} min={0.5} max={10} step={0.5} color={COLORS.muted} />
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="🔊 Advanced Audio"
                        isOpen={sectionStates['audio']}
                        onToggle={() => setSectionState('audio', !sectionStates['audio'])}
                    >
                        <Toggle label="Audio Enabled" value={soundEnabled} onChange={setSoundEnabled} />
                        <div style={{ height: 8 }} />
                        <Slider label="Master Volume" value={masterVolume} onChange={setMasterVolume} min={0} max={1} step={0.05} color={COLORS.primary} />

                        <div style={{ margin: '12px 0 8px 0', fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>Behaviors (Dynamic)</div>
                        <Toggle label="Dynamic Pitch (Distance)" value={audioPitchEnabled} onChange={setAudioPitchEnabled} />
                        <Toggle label="Dynamic Rate (Velocity)" value={audioRateEnabled} onChange={setAudioRateEnabled} />

                        <div style={{ marginBottom: '8px' }}>
                            <Slider label="Solid Tone Dist" value={audioSolidDistance} onChange={setAudioSolidDistance} min={1} max={50} step={1} color={uiAccentColor} />
                            <Slider label="Pitch Mod (x)" value={audioPitchModulation} onChange={setAudioPitchModulation} min={0} max={20} step={0.5} color={COLORS.light} />
                        </div>

                        <div style={{ margin: '12px 0 8px 0', fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>Closing State (Red)</div>
                        <Slider label="Volume" value={audioClosingVolume} onChange={setAudioClosingVolume} min={0} max={2} step={0.1} color={uiAccentColor} />
                        <Slider label="Max Distance" value={audioClosingMaxDist} onChange={setAudioClosingMaxDist} min={10} max={500} step={10} color={uiAccentColor} />
                        <Slider label="Base Pitch" value={audioClosingPitch} onChange={setAudioClosingPitch} min={10} max={1000} step={10} color={uiAccentColor} />

                        <div style={{ margin: '12px 0 8px 0', fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>Opening State (Green)</div>
                        <Slider label="Volume" value={audioOpeningVolume} onChange={setAudioOpeningVolume} min={0} max={1} step={0.1} color={COLORS.primary} />
                        <Slider label="Max Distance" value={audioOpeningMaxDist} onChange={setAudioOpeningMaxDist} min={10} max={500} step={10} color={COLORS.primary} />
                        <Slider label="Base Pitch" value={audioOpeningPitch} onChange={setAudioOpeningPitch} min={10} max={1000} step={10} color={COLORS.primary} />

                        <div style={{ margin: '12px 0 8px 0', fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>Global Mix</div>
                        <Slider label="Ping Vol" value={audioPingVolume} onChange={setAudioPingVolume} min={0} max={1} step={0.1} color={COLORS.light} />
                        <Slider label="Tone Vol (Solid)" value={audioToneVolume} onChange={setAudioToneVolume} min={0} max={1} step={0.1} color={COLORS.light} />

                        <div style={{ margin: '12px 0 8px 0', fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>Styles</div>

                        <div style={{ marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '4px' }}>Ping Waveform</span>
                            <select value={audioPingStyle} onChange={(e) => setAudioPingStyle(e.target.value as any)} style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '4px', borderRadius: '4px' }}>
                                <option value="sine">Sine (Smooth)</option>
                                <option value="square">Square (Retro)</option>
                                <option value="triangle">Triangle (Soft)</option>
                                <option value="sawtooth">Sawtooth (Harsh)</option>
                            </select>
                        </div>

                        <div style={{ marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '4px' }}>Tone Waveform</span>
                            <select value={audioToneStyle} onChange={(e) => setAudioToneStyle(e.target.value as any)} style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '4px', borderRadius: '4px' }}>
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
                        <div style={{ marginBottom: '8px', fontSize: '11px', color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Ground</div>
                        <Slider label="Grid Size" value={groundGridSize} onChange={setGroundGridSize} min={16} max={256} step={16} color={COLORS.muted} />
                        <ColorPicker label="Background" value={groundColorBg} onChange={setGroundColorBg} />
                        <ColorPicker label="Background" value={groundColorBg} onChange={setGroundColorBg} />
                        <ColorPicker label="Grid Lines" value={groundColorGrid} onChange={setGroundColorGrid} />

                        <div style={{ height: '12px' }} />

                        <div style={{ marginBottom: '8px', fontSize: '11px', color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Interface Theme</div>
                        <ColorPicker label="Accent Color" value={uiAccentColor} onChange={setUiAccentColor} />

                        <div style={{ height: '12px' }} />

                        <div style={{ marginBottom: '8px', fontSize: '11px', color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Cubes</div>
                        <Slider label="Grid Size" value={cubeGridSize} onChange={setCubeGridSize} min={64} max={512} step={32} color={COLORS.muted} />
                        <ColorPicker label="Background" value={cubeColorBg} onChange={setCubeColorBg} />
                        <ColorPicker label="Grid Lines" value={cubeColorGrid} onChange={setCubeColorGrid} />
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="📷 Camera & Graphics"
                        isOpen={sectionStates['graphics']}
                        onToggle={() => setSectionState('graphics', !sectionStates['graphics'])}
                    >
                        <Slider label="Cam Stiffness" value={cameraStiffness} onChange={setCameraStiffness} min={1} max={50} step={1} color={COLORS.light} />
                        <Slider label="Cam Distance" value={cameraOffset} onChange={setCameraOffset} min={2} max={50} step={1} color={COLORS.light} />
                        <div style={{ height: '10px' }} />
                        <Toggle label="Shadows" value={shadowsEnabled} onChange={setShadowsEnabled} />
                        <Slider label="Resolution Scale" value={pixelRatio} onChange={setPixelRatio} min={0.25} max={2} step={0.25} color={COLORS.light} />
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="📊 Debug & Metrics"
                        isOpen={sectionStates['debug'] !== false} // Default open if undefined? Or default from context
                        onToggle={() => setSectionState('debug', !sectionStates['debug'])}
                    >
                        <Slider label="Physics Hz" value={physicsRate} onChange={setPhysicsRate} min={30} max={240} step={30} color="#888" />
                    </CollapsibleSection>

                    <div style={{ marginTop: '16px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={handleImportClick}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '8px',
                                    color: 'white',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    letterSpacing: '0.5px'
                                }}
                            >
                                IMPORT JSON
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                            <button
                                onClick={exportSettings}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: 'linear-gradient(135deg, #00b8e6, #005ce6)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: 'white',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    letterSpacing: '0.5px',
                                    boxShadow: '0 4px 15px rgba(0, 100, 255, 0.3)'
                                }}
                            >
                                EXPORT JSON
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
