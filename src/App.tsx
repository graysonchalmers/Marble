import { useEffect } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Scene } from './Scene'
import { SettingsProvider, useSettings } from './SettingsContext'
import { SettingsMenu } from './SettingsMenu'
import { UnifiedDebugMenu } from './UnifiedDebugMenu'
import { MiniMap } from './MiniMap'

function GameUI() {
  const {
    isPaused,
    setIsPaused,
    gameState,
    setGameState,
    countdownValue,
    restartGame,
    score,
    uiAccentColor
  } = useSettings()

  // Handle Escape to Pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Only toggle if playing or countdown
        // We can allow pausing in gameover too, but it doesn't do much.
        if (gameState === 'playing' || gameState === 'countdown') {
          // User requested: "escape... immediately just unpauses again. Maybe I don't want to unpause it until like a mouse click"
          if (!isPaused) {
            setIsPaused(true)
          }
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

    window.addEventListener('keydown', handleKeyDown)
    // Listen for any interaction to unpause
    window.addEventListener('mousedown', handleInteract)
    window.addEventListener('keydown', handleSpaceKey)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('mousedown', handleInteract)
      window.removeEventListener('keydown', handleSpaceKey)
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
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100,
          gap: '24px'
        }}>
          <h1 style={{
            fontSize: '3rem',
            color: 'white',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '4px',
            textShadow: '0 0 20px rgba(255,255,255,0.4)',
            marginBottom: '0',
            textAlign: 'center'
          }}>
            Player Ready
          </h1>

          <button
            onClick={() => setGameState('countdown')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.boxShadow = `0 0 40px ${uiAccentColor}80`
              e.currentTarget.style.borderColor = 'white'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = `0 0 20px ${uiAccentColor}40`
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'
            }}
            style={{
              padding: '20px 60px',
              fontSize: '1.5rem',
              background: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(10px)',
              color: 'white',
              border: '2px solid rgba(255,255,255,0.5)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 700,
              letterSpacing: '4px',
              textTransform: 'uppercase',
              transition: 'all 0.2s ease-out',
              boxShadow: `0 0 20px ${uiAccentColor}40`,
              fontFamily: "'JetBrains Mono', monospace"
            }}
          >
            Start
          </button>

          <div style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '0.9rem',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginTop: '-16px'
          }}>
            Press Space
          </div>
        </div>
      )}

      {/* Pause Overlay - Full Screen Glass */}
      {isPaused && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(5, 5, 8, 0.6)',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 50,
        }}>
          <div style={{
            background: 'rgba(20, 20, 25, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '3rem 5rem',
            borderRadius: '16px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            fontFamily: "'Inter', sans-serif"
          }}>
            <div style={{
              fontSize: '0.9rem',
              color: uiAccentColor,
              textTransform: 'uppercase',
              letterSpacing: '4px',
              fontWeight: 700,
              opacity: 0.9
            }}>
              System Paused
            </div>
            <div style={{
              fontSize: '3.5rem',
              fontWeight: 800,
              color: 'white',
              textShadow: '0 0 30px rgba(255,255,255,0.05)',
              letterSpacing: '-1px'
            }}>
              Standing By
            </div>
            <div style={{
              marginTop: '12px',
              color: 'rgba(255,255,255,0.4)',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontWeight: 500
            }}>
              <span style={{
                background: 'rgba(255,255,255,0.1)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                color: 'white',
                fontWeight: 600,
                border: '1px solid rgba(255,255,255,0.1)'
              }}>SPACE</span>
              to Resume
            </div>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === 'gameover' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at center, rgba(20, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.9) 100%)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100,
          gap: '32px'
        }}>
          <h1 style={{
            fontSize: '6rem',
            margin: 0,
            color: uiAccentColor,
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '-4px',
            textShadow: `3px 3px 0px #000, 0 0 30px ${uiAccentColor}66`,
            WebkitTextStroke: '2px black',
            fontFamily: "'Inter', sans-serif"
          }}>
            Tagged!
          </h1>

          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '2rem',
            color: 'white',
            textAlign: 'center',
            background: 'rgba(255,255,255,0.1)',
            padding: '10px 30px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.2)',
            textShadow: '0 2px 4px rgba(0,0,0,0.5)'
          }}>
            <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>
              Time on the Run
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800 }}>
              {score.toFixed(2)}<span style={{ fontSize: '1.5rem' }}>s</span>
            </div>
          </div>

          <button
            onClick={restartGame}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 10px 30px rgba(229, 57, 53, 0.6)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 0 20px rgba(229, 57, 53, 0.3)'
            }}
            style={{
              padding: '16px 48px',
              fontSize: '1.2rem',
              background: '#E53935', // Red background
              color: '#ffffff', // White text
              border: 'none',
              borderRadius: '50px',
              cursor: 'pointer',
              pointerEvents: 'auto',
              fontWeight: 800,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 0 20px rgba(229, 57, 53, 0.3)'
            }}
          >
            Try Again
          </button>

          <div style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '0.8rem',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginTop: '-16px'
          }}>
            Press Space
          </div>
        </div>
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
