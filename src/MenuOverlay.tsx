import React from 'react'
import { useSettings } from './SettingsContext'

interface MenuOverlayProps {
    title?: string
    subtitle?: React.ReactNode
    children?: React.ReactNode
    darken?: boolean
}

// Consistent fonts
const FONT_HEADER = "'Inter', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

export const MenuOverlay: React.FC<MenuOverlayProps> = ({ title, subtitle, children, darken = true }) => {
    const { uiAccentColor } = useSettings()

    return (
        <div style={{
            position: 'absolute',
            inset: 0,
            background: darken ? 'rgba(5, 5, 8, 0.6)' : 'transparent',
            backdropFilter: darken ? 'blur(16px)' : undefined,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
            fontFamily: FONT_HEADER
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '24px',
                // Optional container style for stricter boxing if needed
            }}>
                {title && (
                    <h1 style={{
                        fontSize: '3.5rem',
                        color: 'white',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '4px',
                        textShadow: '0 0 30px rgba(255,255,255,0.1)',
                        margin: 0,
                        textAlign: 'center',
                        lineHeight: 1.1
                    }}>
                        <span style={{ color: uiAccentColor, opacity: 0.9 }}>{title}</span>
                    </h1>
                )}

                {subtitle && (
                    <div style={{
                        fontSize: '1.2rem',
                        color: 'rgba(255,255,255,0.8)',
                        fontWeight: 500,
                        letterSpacing: '2px',
                        textTransform: 'uppercase',
                        marginTop: '-12px',
                        textAlign: 'center'
                    }}>
                        {subtitle}
                    </div>
                )}

                {children && (
                    <div style={{
                        marginTop: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '16px'
                    }}>
                        {children}
                    </div>
                )}
            </div>
        </div>
    )
}

interface MenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode
    variant?: 'primary' | 'danger'
}

export const MenuButton: React.FC<MenuButtonProps> = ({ children, variant = 'primary', style, ...props }) => {
    const { uiAccentColor } = useSettings()

    const baseColor = variant === 'danger' ? '#E53935' : 'rgba(0, 0, 0, 0.4)'
    const textColor = 'white'
    const borderColor = variant === 'danger' ? 'transparent' : 'rgba(255,255,255,0.5)'

    return (
        <button
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)'
                if (variant === 'danger') {
                    e.currentTarget.style.boxShadow = '0 10px 30px rgba(229, 57, 53, 0.6)'
                } else {
                    e.currentTarget.style.boxShadow = `0 0 40px ${uiAccentColor}80`
                    e.currentTarget.style.borderColor = 'white'
                }
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                if (variant === 'danger') {
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(229, 57, 53, 0.3)'
                } else {
                    e.currentTarget.style.boxShadow = `0 0 20px ${uiAccentColor}40`
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'
                }
            }}
            style={{
                padding: '16px 48px',
                fontSize: '1.2rem',
                background: baseColor,
                backdropFilter: 'blur(10px)',
                color: textColor,
                border: `2px solid ${borderColor}`,
                borderRadius: variant === 'danger' ? '50px' : '4px',
                cursor: 'pointer',
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                transition: 'all 0.2s ease-out',
                boxShadow: variant === 'danger' ? '0 0 20px rgba(229, 57, 53, 0.3)' : `0 0 20px ${uiAccentColor}40`,
                fontFamily: FONT_MONO,
                pointerEvents: 'auto',
                ...style
            }}
            {...props}
        >
            {children}
        </button>
    )
}

export const StartScreen: React.FC<{ onStart: () => void }> = ({ onStart }) => {
    return (
        <MenuOverlay
            darken={false} // Clean look for start
            title="Player Ready"
        >
            <MenuButton onClick={onStart}>
                Start
            </MenuButton>
            <div style={{
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '0.9rem',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                fontWeight: 600,
                fontFamily: FONT_MONO
            }}>
                Press Space
            </div>
        </MenuOverlay>
    )
}

export const PauseScreen: React.FC<{ onResume: () => void }> = ({ onResume }) => {
    return (
        <MenuOverlay
            title="Standing By"
            subtitle="System Paused"
        >
            <div style={{
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
        </MenuOverlay>
    )
}

export const GameOverScreen: React.FC<{ score: number, onRestart: () => void }> = ({ score, onRestart }) => {

    return (
        <MenuOverlay
            title="Tagged!"
            darken={true}
        >
            <div style={{
                fontFamily: FONT_HEADER,
                fontSize: '2rem',
                color: 'white',
                textAlign: 'center',
                background: 'rgba(255,255,255,0.1)',
                padding: '10px 30px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.2)',
                textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                marginBottom: '10px'
            }}>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>
                    Time on the Run
                </div>
                <div style={{ fontSize: '2.5rem', fontWeight: 800 }}>
                    {score.toFixed(2)}<span style={{ fontSize: '1.5rem' }}>s</span>
                </div>
            </div>

            <MenuButton variant="danger" onClick={onRestart}>
                Try Again
            </MenuButton>
            <div style={{
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '0.8rem',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                fontWeight: 600,
                fontFamily: FONT_MONO
            }}>
                Press Space
            </div>
        </MenuOverlay>
    )
}
