import { createContext, useContext, useState, useEffect, useRef, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import { soundManager } from './SoundManager'

// Types
export type GameState = 'start' | 'setup' | 'countdown' | 'playing' | 'gameover' | 'won'

export interface Settings {
    // Gameplay
    jumpForce: number
    moveSpeed: number
    enemySpeed: number
    enemySize: number
    enemyMass: number
    gravity: number
    friction: number
    restitution: number
    worldScale: number

    // Level
    cubeCount: number
    cubeScale: number

    // Perf
    soundEnabled: boolean
    physicsRate: number
    shadowsEnabled: boolean
    pixelRatio: number

    // Camera
    cameraStiffness: number
    cameraOffset: number

    // Gameplay V2
    useV2AI: boolean
    playerAirControl: number
    enemyAirControl: number

    // Debug
    showPerf: boolean

    // Visuals
    groundGridSize: number
    groundColorBg: string
    groundColorGrid: string
    cubeGridSize: number
    cubeColorBg: string
    cubeColorGrid: string
    uiAccentColor: string

    // Audio Persistence
    masterVolume: number
    audioPitchEnabled: boolean
    audioRateEnabled: boolean
    audioClosingVolume: number
    audioOpeningVolume: number
    audioPingVolume: number
    audioToneVolume: number
    audioPingStyle: 'sine' | 'square' | 'triangle' | 'sawtooth'
    audioToneStyle: 'sine' | 'square' | 'triangle' | 'sawtooth'

    // Granular Pitch/Dist
    audioClosingMaxDist: number
    audioOpeningMaxDist: number
    audioClosingPitch: number
    audioOpeningPitch: number
    audioSolidDistance: number
    audioPitchModulation: number
    audioStrategy: 'drone' | 'pulse'

    // UI Persistence
    controlsOpen: boolean
    sectionStates: Record<string, boolean>
}

const STORAGE_KEY = 'MARBLE_GAME_SETTINGS_V2'

const DEFAULT_SETTINGS: Settings = {
    jumpForce: 5,
    moveSpeed: 8,
    enemySpeed: 2,
    enemySize: 0.9,
    enemyMass: 2.5,
    gravity: -22.5,
    friction: 0.35,
    restitution: 0.2,
    worldScale: 0.75,
    cubeCount: 30,
    cubeScale: 7,
    soundEnabled: true,
    physicsRate: 60,
    shadowsEnabled: true,
    pixelRatio: 1,
    cameraStiffness: 3,
    cameraOffset: 15,
    useV2AI: true,
    playerAirControl: 0.1,
    enemyAirControl: 0,
    showPerf: true,
    controlsOpen: true,
    sectionStates: {
        'gameplay': true,
        'physics': true,
        'environment': true,
        'graphics': true,
        'visuals': true
    },
    groundGridSize: 176,
    groundColorBg: '#70b348',
    groundColorGrid: '#3e6b1f',
    cubeGridSize: 256,
    cubeColorBg: '#d3d3d3',
    cubeColorGrid: '#404040',
    uiAccentColor: '#E53935',

    // Audio Defaults
    masterVolume: 0.5,
    audioPitchEnabled: true,
    audioRateEnabled: true,
    audioClosingVolume: 1,
    audioOpeningVolume: 0.3,
    audioPingVolume: 0.6,
    audioToneVolume: 0.5,
    audioPingStyle: 'sine',
    audioToneStyle: 'triangle',
    audioClosingMaxDist: 150,
    audioOpeningMaxDist: 150,
    audioClosingPitch: 300,
    audioOpeningPitch: 200,
    audioSolidDistance: 10,
    audioPitchModulation: 4,
    audioStrategy: 'drone'
}

function loadSettings(): Settings {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
        try {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
        } catch (e) {
            console.error('Failed to load settings', e)
        }
    }
    return DEFAULT_SETTINGS
}

interface SettingsContextType extends Settings {
    // Setters
    setJumpForce: Dispatch<SetStateAction<number>>
    setMoveSpeed: Dispatch<SetStateAction<number>>
    setEnemySpeed: Dispatch<SetStateAction<number>>
    setEnemySize: Dispatch<SetStateAction<number>>
    setEnemyMass: Dispatch<SetStateAction<number>>
    setGravity: Dispatch<SetStateAction<number>>
    setFriction: Dispatch<SetStateAction<number>>
    setRestitution: Dispatch<SetStateAction<number>>
    setWorldScale: Dispatch<SetStateAction<number>>
    setCubeCount: Dispatch<SetStateAction<number>>
    setCubeScale: Dispatch<SetStateAction<number>>

    // Custom Setters (Not pure Dispatch)
    setSoundEnabled: (val: boolean) => void

    setPhysicsRate: Dispatch<SetStateAction<number>>
    setShadowsEnabled: Dispatch<SetStateAction<boolean>>
    setPixelRatio: Dispatch<SetStateAction<number>>
    setCameraStiffness: Dispatch<SetStateAction<number>>
    setCameraOffset: Dispatch<SetStateAction<number>>

    setUseV2AI: Dispatch<SetStateAction<boolean>>
    setPlayerAirControl: Dispatch<SetStateAction<number>>
    setEnemyAirControl: Dispatch<SetStateAction<number>>
    setShowPerf: Dispatch<SetStateAction<boolean>>

    setControlsOpen: Dispatch<SetStateAction<boolean>>
    setSectionState: (section: string, isOpen: boolean) => void

    // Visual Setters
    setGroundGridSize: Dispatch<SetStateAction<number>>
    setGroundColorBg: Dispatch<SetStateAction<string>>
    setGroundColorGrid: Dispatch<SetStateAction<string>>
    setCubeGridSize: Dispatch<SetStateAction<number>>
    setCubeColorBg: Dispatch<SetStateAction<string>>
    setCubeColorGrid: Dispatch<SetStateAction<string>>
    setUiAccentColor: Dispatch<SetStateAction<string>>

    // Session State (Not Persisted)
    isPaused: boolean
    setIsPaused: Dispatch<SetStateAction<boolean>>
    gameState: GameState
    setGameState: Dispatch<SetStateAction<GameState>>
    countdownValue: number
    setCountdownValue: Dispatch<SetStateAction<number>>

    audioDebugMode: { closingEnabled: boolean, openingEnabled: boolean }
    setAudioDebugMode: Dispatch<SetStateAction<{ closingEnabled: boolean, openingEnabled: boolean }>>

    debugVelocity: number
    setDebugVelocity: Dispatch<SetStateAction<number>>

    enemyAIState: string
    setEnemyAIState: Dispatch<SetStateAction<string>>

    playerPosition: { x: number; y: number; z: number }
    setPlayerPosition: Dispatch<SetStateAction<{ x: number; y: number; z: number }>>

    enemyPosition: { x: number; y: number; z: number }
    setEnemyPosition: Dispatch<SetStateAction<{ x: number; y: number; z: number }>>

    // Performance Stats Setter
    perfStats: { fps: number; cpu: number; gpu: number }
    setPerfStats: (val: { fps: number; cpu: number; gpu: number }) => void

    // Audio Controls
    setMasterVolume: (val: number) => void

    // Granular Behavior
    setAudioPitchEnabled: (val: boolean) => void
    setAudioRateEnabled: (val: boolean) => void

    // Granular Volumes
    setAudioClosingVolume: (val: number) => void
    setAudioOpeningVolume: (val: number) => void
    setAudioPingVolume: (val: number) => void
    setAudioToneVolume: (val: number) => void

    // Sound Styles
    setAudioPingStyle: (val: 'sine' | 'square' | 'triangle' | 'sawtooth') => void
    setAudioToneStyle: (val: 'sine' | 'square' | 'triangle' | 'sawtooth') => void

    setAudioClosingMaxDist: (val: number) => void
    setAudioOpeningMaxDist: (val: number) => void
    setAudioClosingPitch: (val: number) => void
    setAudioOpeningPitch: (val: number) => void
    setAudioSolidDistance: (val: number) => void
    setAudioPitchModulation: (val: number) => void
    setAudioStrategy: (val: 'drone' | 'pulse') => void

    restartGame: () => void
    exportSettings: () => void
    importSettings: (file: File) => void

    // Score
    score: number
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
    const initialSettings = loadSettings()

    // State Hooks
    const [jumpForce, setJumpForce] = useState(initialSettings.jumpForce)
    const [moveSpeed, setMoveSpeed] = useState(initialSettings.moveSpeed)
    const [enemySpeed, setEnemySpeed] = useState(initialSettings.enemySpeed)
    const [enemySize, setEnemySize] = useState(initialSettings.enemySize ?? 0.6)
    const [enemyMass, setEnemyMass] = useState(initialSettings.enemyMass ?? 1.5)
    const [gravity, setGravity] = useState(initialSettings.gravity)
    const [friction, setFriction] = useState(initialSettings.friction)
    const [restitution, setRestitution] = useState(initialSettings.restitution)
    const [worldScale, setWorldScale] = useState(initialSettings.worldScale ?? 1.0)
    const [cubeCount, setCubeCount] = useState(initialSettings.cubeCount)
    const [cubeScale, setCubeScale] = useState(initialSettings.cubeScale)
    const [soundEnabled, setAudioEnabled] = useState(initialSettings.soundEnabled)
    const [physicsRate, setPhysicsRate] = useState(initialSettings.physicsRate)
    const [shadowsEnabled, setShadowsEnabled] = useState(initialSettings.shadowsEnabled)
    const [pixelRatio, setPixelRatio] = useState(initialSettings.pixelRatio)
    const [cameraStiffness, setCameraStiffness] = useState(initialSettings.cameraStiffness)
    const [cameraOffset, setCameraOffset] = useState(initialSettings.cameraOffset)

    const [useV2AI, setUseV2AI] = useState(initialSettings.useV2AI)
    const [playerAirControl, setPlayerAirControl] = useState(initialSettings.playerAirControl)
    const [enemyAirControl, setEnemyAirControl] = useState(initialSettings.enemyAirControl)

    const [showPerf, setShowPerf] = useState(initialSettings.showPerf)
    const [controlsOpen, setControlsOpen] = useState(initialSettings.controlsOpen)
    const [sectionStates, setSectionStates] = useState(initialSettings.sectionStates)

    const [groundGridSize, setGroundGridSize] = useState(initialSettings.groundGridSize)
    const [groundColorBg, setGroundColorBg] = useState(initialSettings.groundColorBg)
    const [groundColorGrid, setGroundColorGrid] = useState(initialSettings.groundColorGrid)

    const [cubeGridSize, setCubeGridSize] = useState(initialSettings.cubeGridSize)
    const [cubeColorBg, setCubeColorBg] = useState(initialSettings.cubeColorBg)
    const [cubeColorGrid, setCubeColorGrid] = useState(initialSettings.cubeColorGrid)
    const [uiAccentColor, setUiAccentColor] = useState(initialSettings.uiAccentColor ?? '#E53935')

    // Audio State
    const [masterVolume, setMasterVolume] = useState(initialSettings.masterVolume ?? 0.5)

    const [audioPitchEnabled, setAudioPitchEnabled] = useState(initialSettings.audioPitchEnabled ?? true)
    const [audioRateEnabled, setAudioRateEnabled] = useState(initialSettings.audioRateEnabled ?? true)

    const [audioClosingVolume, setAudioClosingVolume] = useState(initialSettings.audioClosingVolume ?? 1.0)
    const [audioOpeningVolume, setAudioOpeningVolume] = useState(initialSettings.audioOpeningVolume ?? 0.3)

    const [audioPingVolume, setAudioPingVolume] = useState(initialSettings.audioPingVolume ?? 0.6)
    const [audioToneVolume, setAudioToneVolume] = useState(initialSettings.audioToneVolume ?? 0.5)

    const [audioPingStyle, setAudioPingStyle] = useState(initialSettings.audioPingStyle ?? 'sine')
    const [audioToneStyle, setAudioToneStyle] = useState(initialSettings.audioToneStyle ?? 'triangle')

    const [audioClosingMaxDist, setAudioClosingMaxDist] = useState(initialSettings.audioClosingMaxDist ?? 150)
    const [audioOpeningMaxDist, setAudioOpeningMaxDist] = useState(initialSettings.audioOpeningMaxDist ?? 150)
    const [audioClosingPitch, setAudioClosingPitch] = useState(initialSettings.audioClosingPitch ?? 300)
    const [audioOpeningPitch, setAudioOpeningPitch] = useState(initialSettings.audioOpeningPitch ?? 200)
    const [audioSolidDistance, setAudioSolidDistance] = useState(initialSettings.audioSolidDistance ?? 10)
    const [audioPitchModulation, setAudioPitchModulation] = useState(initialSettings.audioPitchModulation ?? 4)
    const [audioStrategy, setAudioStrategy] = useState(initialSettings.audioStrategy ?? 'drone')

    // Session State
    const [isPaused, setIsPaused] = useState(false)
    const [gameState, setGameState] = useState<GameState>('start')
    const [countdownValue, setCountdownValue] = useState(5)

    const [audioDebugMode, setAudioDebugMode] = useState({ closingEnabled: true, openingEnabled: true })
    const [debugVelocity, setDebugVelocity] = useState(0)

    const [enemyAIState, setEnemyAIState] = useState('idle')
    const [playerPosition, setPlayerPosition] = useState({ x: 0, y: 0, z: 0 })
    const [enemyPosition, setEnemyPosition] = useState({ x: 0, y: 20, z: -15 })

    const [perfStats, setPerfStats] = useState({ fps: 0, cpu: 0, gpu: 0 })

    // Score State
    const [score, setScore] = useState(0)
    const startTimeRef = useRef(0)

    // Handle Score Logic
    useEffect(() => {
        if (gameState === 'playing') {
            startTimeRef.current = Date.now()
            setScore(0)
        } else if (gameState === 'gameover' && startTimeRef.current > 0) {
            setScore((Date.now() - startTimeRef.current) / 1000)
            startTimeRef.current = 0
        }
    }, [gameState])

    // Helper for section toggling
    const setSectionState = (section: string, isOpen: boolean) => {
        setSectionStates(prev => ({ ...prev, [section]: isOpen }))
    }

    // Persist changes
    useEffect(() => {
        const settingsToSave: Partial<Settings> = {
            jumpForce, moveSpeed, enemySpeed, enemySize, enemyMass, gravity, friction, restitution, worldScale,
            cubeCount, cubeScale, soundEnabled, physicsRate, shadowsEnabled,
            pixelRatio, cameraStiffness, cameraOffset, useV2AI, playerAirControl,
            enemyAirControl, showPerf, controlsOpen, sectionStates,
            groundGridSize, groundColorBg, groundColorGrid, cubeGridSize, cubeColorBg, cubeColorGrid,
            uiAccentColor,
            masterVolume, audioPitchEnabled, audioRateEnabled,
            audioClosingVolume, audioOpeningVolume, audioPingVolume, audioToneVolume,
            audioPingStyle, audioToneStyle,
            audioClosingMaxDist, audioOpeningMaxDist, audioClosingPitch, audioOpeningPitch,
            audioSolidDistance, audioPitchModulation, audioStrategy
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToSave))
    }, [
        jumpForce, moveSpeed, enemySpeed, enemySize, enemyMass, gravity, friction, restitution, worldScale,
        cubeCount, cubeScale, soundEnabled, physicsRate, shadowsEnabled,
        pixelRatio, cameraStiffness, cameraOffset, useV2AI, playerAirControl,
        enemyAirControl, showPerf, controlsOpen, sectionStates,
        groundGridSize, groundColorBg, groundColorGrid, cubeGridSize, cubeColorBg, cubeColorGrid,
        uiAccentColor,
        masterVolume, audioPitchEnabled, audioRateEnabled,
        audioClosingVolume, audioOpeningVolume, audioPingVolume, audioToneVolume,
        audioPingStyle, audioToneStyle,
        audioClosingMaxDist, audioOpeningMaxDist, audioClosingPitch, audioOpeningPitch,
        audioSolidDistance, audioPitchModulation, audioStrategy
    ])

    const setSoundEnabled = (val: boolean) => {
        setAudioEnabled(val)
        soundManager.setEnabled(val)
    }

    const restartGame = () => {
        setIsPaused(false)
        setGameState('start')
        setCountdownValue(5)
        window.location.reload()
    }

    const exportSettings = () => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

        // Collect all current settings
        const currentSettings: Settings = {
            jumpForce, moveSpeed, enemySpeed, enemySize, enemyMass, gravity, friction, restitution, worldScale,
            cubeCount, cubeScale, soundEnabled, physicsRate, shadowsEnabled,
            pixelRatio, cameraStiffness, cameraOffset, useV2AI, playerAirControl,
            enemyAirControl, showPerf, controlsOpen, sectionStates,
            groundGridSize, groundColorBg, groundColorGrid, cubeGridSize, cubeColorBg, cubeColorGrid,
            uiAccentColor,
            masterVolume, audioPitchEnabled, audioRateEnabled,
            audioClosingVolume, audioOpeningVolume, audioPingVolume, audioToneVolume,
            audioPingStyle, audioToneStyle,
            audioClosingMaxDist, audioOpeningMaxDist, audioClosingPitch, audioOpeningPitch,
            audioSolidDistance, audioPitchModulation, audioStrategy
        }

        const json = JSON.stringify(currentSettings, null, 2)

        // Create and download file
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `marble-settings-${timestamp}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const importSettings = (file: File) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string
                const imported = JSON.parse(content) as Partial<Settings>

                // Apply settings if they exist in the imported file
                if (imported.jumpForce !== undefined) setJumpForce(imported.jumpForce)
                if (imported.moveSpeed !== undefined) setMoveSpeed(imported.moveSpeed)
                if (imported.enemySpeed !== undefined) setEnemySpeed(imported.enemySpeed)
                if (imported.enemySize !== undefined) setEnemySize(imported.enemySize)
                if (imported.enemyMass !== undefined) setEnemyMass(imported.enemyMass)
                if (imported.gravity !== undefined) setGravity(imported.gravity)
                if (imported.friction !== undefined) setFriction(imported.friction)
                if (imported.restitution !== undefined) setRestitution(imported.restitution)
                if (imported.worldScale !== undefined) setWorldScale(imported.worldScale)

                if (imported.cubeCount !== undefined) setCubeCount(imported.cubeCount)
                if (imported.cubeScale !== undefined) setCubeScale(imported.cubeScale)

                if (imported.soundEnabled !== undefined) setSoundEnabled(imported.soundEnabled)
                if (imported.physicsRate !== undefined) setPhysicsRate(imported.physicsRate)
                if (imported.shadowsEnabled !== undefined) setShadowsEnabled(imported.shadowsEnabled)
                if (imported.pixelRatio !== undefined) setPixelRatio(imported.pixelRatio)
                if (imported.cameraStiffness !== undefined) setCameraStiffness(imported.cameraStiffness)
                if (imported.cameraOffset !== undefined) setCameraOffset(imported.cameraOffset)

                if (imported.useV2AI !== undefined) setUseV2AI(imported.useV2AI)
                if (imported.playerAirControl !== undefined) setPlayerAirControl(imported.playerAirControl)
                if (imported.enemyAirControl !== undefined) setEnemyAirControl(imported.enemyAirControl)

                if (imported.showPerf !== undefined) setShowPerf(imported.showPerf)
                if (imported.controlsOpen !== undefined) setControlsOpen(imported.controlsOpen)
                if (imported.sectionStates !== undefined) setSectionStates(imported.sectionStates)

                if (imported.groundGridSize !== undefined) setGroundGridSize(imported.groundGridSize)
                if (imported.groundColorBg !== undefined) setGroundColorBg(imported.groundColorBg)
                if (imported.groundColorGrid !== undefined) setGroundColorGrid(imported.groundColorGrid)
                if (imported.cubeGridSize !== undefined) setCubeGridSize(imported.cubeGridSize)
                if (imported.cubeColorBg !== undefined) setCubeColorBg(imported.cubeColorBg)
                if (imported.cubeColorGrid !== undefined) setCubeColorGrid(imported.cubeColorGrid)
                if (imported.uiAccentColor !== undefined) setUiAccentColor(imported.uiAccentColor)

                if (imported.masterVolume !== undefined) setMasterVolume(imported.masterVolume)
                if (imported.audioPitchEnabled !== undefined) setAudioPitchEnabled(imported.audioPitchEnabled)
                if (imported.audioRateEnabled !== undefined) setAudioRateEnabled(imported.audioRateEnabled)

                if (imported.audioClosingVolume !== undefined) setAudioClosingVolume(imported.audioClosingVolume)
                if (imported.audioOpeningVolume !== undefined) setAudioOpeningVolume(imported.audioOpeningVolume)
                if (imported.audioPingVolume !== undefined) setAudioPingVolume(imported.audioPingVolume)
                if (imported.audioToneVolume !== undefined) setAudioToneVolume(imported.audioToneVolume)

                if (imported.audioPingStyle !== undefined) setAudioPingStyle(imported.audioPingStyle)
                if (imported.audioToneStyle !== undefined) setAudioToneStyle(imported.audioToneStyle)

                if (imported.audioClosingMaxDist !== undefined) setAudioClosingMaxDist(imported.audioClosingMaxDist)
                if (imported.audioOpeningMaxDist !== undefined) setAudioOpeningMaxDist(imported.audioOpeningMaxDist)
                if (imported.audioClosingPitch !== undefined) setAudioClosingPitch(imported.audioClosingPitch)
                if (imported.audioOpeningPitch !== undefined) setAudioOpeningPitch(imported.audioOpeningPitch)
                if (imported.audioSolidDistance !== undefined) setAudioSolidDistance(imported.audioSolidDistance)
                if (imported.audioPitchModulation !== undefined) setAudioPitchModulation(imported.audioPitchModulation)
                if (imported.audioStrategy !== undefined) setAudioStrategy(imported.audioStrategy)

                // Force a reload or some notification? 
                // For now, the state updates should reflect immediately in UI
            } catch (error) {
                console.error('Failed to import settings:', error)
                alert('Failed to import settings. Invalid JSON.')
            }
        }
        reader.readAsText(file)
    }
    return (
        <SettingsContext.Provider value={{
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

            // Session State
            isPaused, setIsPaused,
            gameState, setGameState,
            countdownValue, setCountdownValue,
            audioDebugMode, setAudioDebugMode,
            debugVelocity, setDebugVelocity,

            showPerf, setShowPerf,
            physicsRate, setPhysicsRate,
            shadowsEnabled, setShadowsEnabled,
            pixelRatio, setPixelRatio,
            cameraStiffness, setCameraStiffness,
            cameraOffset, setCameraOffset,

            useV2AI, setUseV2AI,
            enemyAIState, setEnemyAIState,
            playerPosition, setPlayerPosition,
            enemyPosition, setEnemyPosition,
            playerAirControl, setPlayerAirControl,
            enemyAirControl, setEnemyAirControl,

            controlsOpen, setControlsOpen,
            sectionStates, setSectionState,
            groundGridSize, setGroundGridSize,
            groundColorBg, setGroundColorBg,
            groundColorGrid, setGroundColorGrid,
            cubeGridSize, setCubeGridSize,
            cubeColorBg, setCubeColorBg,
            cubeColorGrid, setCubeColorGrid,
            uiAccentColor, setUiAccentColor,
            perfStats, setPerfStats,

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
            audioStrategy, setAudioStrategy,

            score,

            restartGame,
            exportSettings,
            importSettings
        }}>
            {children}
        </SettingsContext.Provider>
    )
}

export const useSettings = () => {
    const context = useContext(SettingsContext)
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider')
    }
    return context
}
