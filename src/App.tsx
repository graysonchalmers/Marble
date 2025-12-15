import { useEffect } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Scene } from './Scene'
import { SettingsProvider, useSettings } from './SettingsContext'
import { SettingsMenu } from './SettingsMenu'
import { UnifiedDebugMenu } from './UnifiedDebugMenu'
import { MiniMap } from './MiniMap'
import { StartScreen, PauseScreen, GameOverScreen } from './MenuOverlay'

function GameUI() {
  const {
    isPaused,
    setIsPaused,
    gameState,
    setGameState,
    countdownValue,
    restartGame,
    score
  } = useSettings()

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
  const { debugVelocity } = useSettings()
  const velAbs = Math.abs(debugVelocity)
  // Scale font size: Base 2rem, + 0.1rem per unit of speed, capped around 6rem?
  const fontSize = `${Math.min(6, 2 + (velAbs * 0.1))}rem`
  const color = debugVelocity > 0 ? '#E53935' : '#44ff44' // Red = Closing, Green = Opening
  const label = debugVelocity > 0 ? 'CLOSING' : 'OPENING'

  return (
    <>
      {/* Velocity Debug Indicator */}
      {gameState === 'playing' && !isPaused && (
        <div style={{
          position: 'absolute',
          top: '70%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          fontFamily: "'JetBrains Mono', monospace",
          pointerEvents: 'none',
          zIndex: 5,
          opacity: 0.9,

          transition: 'opacity 0.2s',
          textShadow: '0 2px 10px rgba(0,0,0,0.5)'
        }}>
          <div style={{
            color: color,
            fontSize: fontSize,
            fontWeight: 800,
            transition: 'font-size 0.05s ease-out',
            lineHeight: 1
          }}>
            {Math.round(velAbs)} <span style={{ fontSize: '0.4em', fontWeight: 600 }}>M/S</span>
          </div>
          <div style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: '1rem',
            fontWeight: 700,
            letterSpacing: '2px',
            marginTop: '4px'
          }}>
            {label}
          </div>
        </div>
      )}

      {/* Setup / Start Screen */}
      {gameState === 'setup' && (
        <StartScreen onStart={() => setGameState('countdown')} />
      )}

      {/* Pause Overlay */}
      {isPaused && (
        <PauseScreen onResume={() => setIsPaused(false)} />
      )}

      {/* Game Over Screen */}
      {gameState === 'gameover' && (
        <GameOverScreen score={score} onRestart={restartGame} />
      )}

      {/* Countdown Screen */}
      {gameState === 'countdown' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 20
        }}>
          <div style={{
            color: 'white',
            fontFamily: "'Inter', sans-serif", // Ensured
            fontSize: '8rem',
            fontWeight: 900,
            textShadow: '4px 4px 0px #000, 0 0 40px rgba(255, 255, 255, 0.3)', // Soft white glow, no aqua
            WebkitTextStroke: '2px black',
            opacity: 1
          }}>
            {countdownValue === 0 ? 'ENGAGE' : countdownValue}
          </div>
        </div>
      )}
    </>
  )
}

function App() {
  // Pull debug state from context - need a wrapper component since this needs to be inside provider
  return (
    <SettingsProvider>
      <AppInner />
    </SettingsProvider>
  )
}

function AppInner() {
  const { playerPosition, enemyPosition, uiAccentColor } = useSettings()

  return (
    <>
      <Scene />
      <GameUI />
      <SettingsMenu />

      {/* Top Left Container for Title & Minimap */}
      <div style={{
        position: 'absolute',
        top: 24,
        left: 24,
        zIndex: 200, // Above Overlays
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        alignItems: 'flex-start',
        pointerEvents: 'none' // Let clicks pass through empty areas
      }}>

        {/* HUD: Title & Credits Card */}
        <div style={{
          pointerEvents: 'auto', // Allow clicking links
          background: 'rgba(15, 15, 20, 0.6)',
          backdropFilter: 'blur(10px)',
          padding: '20px',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          gap: '20px',
          alignItems: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
        }}>
          <div>
            <h1 style={{
              margin: '0 0 8px 0',
              fontSize: '2.5rem',
              letterSpacing: '-1px',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 900,
              color: uiAccentColor,
              textTransform: 'uppercase',
              textShadow: `2px 2px 0px #000, 0 0 15px ${uiAccentColor}4D`,
              WebkitTextStroke: '1px black'
            }}>
              Tag!
            </h1>
            <div style={{
              fontSize: '0.85rem',
              color: 'rgba(255,255,255,0.8)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500
            }}>
              <span style={{ color: '#ffffff', fontWeight: 600 }}>Grayson Chalmers</span>
              <span>+ Google Gemini</span>
              <span>+ Antigravity</span>

              <a
                href="https://www.graysonchalmers.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginTop: '8px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  textDecoration: 'underline',
                  fontSize: '0.8rem',
                  alignSelf: 'flex-start'
                }}
              >
                www.graysonchalmers.com
              </a>
            </div>
          </div>

          {/* QR Code */}
          <div style={{
            background: 'white',
            padding: '8px',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <QRCodeCanvas
              value="https://www.graysonchalmers.com"
              size={80}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          </div>
        </div>

        {/* Mini Map */}
        <div style={{
          pointerEvents: 'auto'
        }}>
          <MiniMap
            playerPos={{ x: playerPosition.x, z: playerPosition.z }}
            enemyPos={{ x: enemyPosition.x, z: enemyPosition.z }}
          />
        </div>

      </div>

      {/* Version */}
      <div style={{
        position: 'absolute',
        bottom: 5,
        right: 20,
        color: 'rgba(255,255,255,0.2)',
        fontFamily: "'Inter', sans-serif",
        fontSize: '0.7rem',
        pointerEvents: 'none',
        zIndex: 20
      }}>
        v0.3.1
      </div>

      {/* Unified Debug Menu */}
      <UnifiedDebugMenu />
    </>
  )
}

export default App
