import { useEffect } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Scene } from './components/game/Scene'
import { useGameStore } from './store/useGameStore'
import { SettingsMenu } from './components/ui/SettingsMenu'
import { UnifiedDebugMenu } from './components/ui/UnifiedDebugMenu'
import { MiniMap } from './components/ui/MiniMap'
import { StartScreen, PauseScreen, GameOverScreen } from './components/ui/MenuOverlay'
import { VersionOverlay } from './components/ui/VersionOverlay'
import { Box3DBetaPlaceholder } from './components/game-beta/Box3DBetaPlaceholder'
import { getRuntimePhysicsBackend } from './physics/runtime'

function GameUI() {
  const {
    isPaused,
    setIsPaused,
    gameState,
    setGameState,
    countdownValue,
    restartGame,
    score,
    personalBest
  } = useGameStore()

  // Handle Escape to Pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Only toggle if playing or countdown
        // We can allow pausing in gameover too, but it doesn't do much.
        if (gameState === 'playing' || gameState === 'countdown') {
          // User requested: Toggle pause on Escape
          setIsPaused(prev => !prev)
        }
      }
    }

    const handleInteract = () => {
      if (isPaused && (gameState === 'playing' || gameState === 'countdown')) {
        setIsPaused(false)
      }
    }

    const handleSpaceKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (isPaused) {
          handleInteract()
        } else if (gameState === 'gameover') {
          restartGame()
        } else if (gameState === 'setup') {
          setGameState('countdown')
        }
      }
    }

    const handleBlur = () => {
      if (gameState === 'playing' || gameState === 'countdown') {
        setIsPaused(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    // Listen for any interaction to unpause
    window.addEventListener('mousedown', handleInteract)
    window.addEventListener('keydown', handleSpaceKey)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('mousedown', handleInteract)
      window.removeEventListener('keydown', handleSpaceKey)
      window.removeEventListener('blur', handleBlur)
    }
  }, [gameState, isPaused, setIsPaused, setGameState]) // Added setGameState dependency

  // Debug Velocity Display
  const debugVelocity = useGameStore(state => state.debugVelocity)
  const velAbs = Math.abs(debugVelocity)
  // Scale font size: Base 2rem, + 0.1rem per unit of speed, capped around 6rem?
  const fontSize = `${Math.min(6, 2 + (velAbs * 0.1))}rem`
  const color = debugVelocity > 0 ? '#E53935' : '#44ff44' // Red = Closing, Green = Opening
  const label = debugVelocity > 0 ? 'CLOSING' : 'OPENING'

  return (
    <>
      {/* Velocity Debug Indicator */}
      {gameState === 'playing' && !isPaused && (
        <div className="velocity-debug">
          <div className="velocity-debug-value" style={{
            color: color,
            fontSize: fontSize
          }}>
            {Math.round(velAbs)} <span>M/S</span>
          </div>
          <div className="velocity-debug-label">
            {label}
          </div>
        </div>
      )}

      {/* Time Alive HUD Timer */}
      {gameState === 'playing' && !isPaused && (
        <div className="big-timer-container">
          <div className="big-timer-mountain">🏔️ CLIMBING</div>
          <div 
            className="big-timer-value"
            key={Math.floor(score / 10)}
            style={{ animation: Math.floor(score) >= 10 ? 'timerPulse 0.8s cubic-bezier(0.25, 1, 0.5, 1)' : undefined }}
          >
            {score.toFixed(2)}<span>s</span>
          </div>
          <div className="big-timer-best">
            BEST: {personalBest.toFixed(2)}s
          </div>
        </div>
      )}

      {/* Setup / Start Screen */}
      {gameState === 'setup' && (
        <StartScreen onStart={() => setGameState('countdown')} />
      )}

      {/* Pause Overlay */}
      {isPaused && gameState === 'playing' && <PauseScreen />}

      {/* Game Over Screen */}
      {gameState === 'gameover' && (
        <GameOverScreen score={score} onRestart={restartGame} />
      )}

      {/* Countdown Screen */}
      {gameState === 'countdown' && (
        <div className="countdown-screen">
          <div className="countdown-text">
            {countdownValue === 0 ? 'ENGAGE' : countdownValue}
          </div>
        </div>
      )}
    </>
  )
}

function App() {
  return <AppInner />
}

function AppInner() {
  const { playerPosition, enemyPosition, uiAccentColor } = useGameStore()
  const physicsBackend = getRuntimePhysicsBackend(window.location.search)

  if (physicsBackend === 'box3d') {
    return <Box3DBetaPlaceholder />
  }

  return (
    <>
      <Scene />
      <GameUI />
      <SettingsMenu />

      {/* Top Left Container for Title & Minimap */}
      <div className="top-left-container">

        {/* HUD: Title & Credits Card */}
        <div className="title-card">
          <div>
            <h1 className="title-text" style={{
              color: uiAccentColor,
              textShadow: `2px 2px 0px #000, 0 0 15px ${uiAccentColor}4D`
            }}>
              Tag!
            </h1>
            <div className="subtitle-container">
              <span className="subtitle-name">Grayson Chalmers</span>
              <span>+ Google Gemini</span>
              <span>+ Antigravity</span>

              <a
                href="https://www.graysonchalmers.com"
                target="_blank"
                rel="noopener noreferrer"
                className="subtitle-link"
              >
                www.graysonchalmers.com
              </a>
            </div>
          </div>

          {/* QR Code */}
          <div className="qr-container">
            <QRCodeCanvas
              value="https://www.graysonchalmers.com"
              size={80}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          </div>
        </div>

        {/* Mini Map */}
        <div className="minimap-wrapper">
          <MiniMap
            playerPos={{ x: playerPosition.x, z: playerPosition.z }}
            enemyPos={{ x: enemyPosition.x, z: enemyPosition.z }}
          />
        </div>

      </div>

      {/* Version Overlay and Changelog */}
      <VersionOverlay />

      {/* Unified Debug Menu */}
      <UnifiedDebugMenu />
    </>
  )
}

export default App

