import React from 'react'
import { useGameStore } from '../../store/useGameStore'

interface MenuOverlayProps {
    title?: string
    subtitle?: React.ReactNode
    children?: React.ReactNode
    darken?: boolean
}

// Removed unused fonts

export const MenuOverlay: React.FC<MenuOverlayProps> = ({ title, subtitle, children, darken = true }) => {
    const uiAccentColor = useGameStore(s => s.uiAccentColor)

    return (
        <div
            className="menu-overlay"
            style={{
                background: darken ? 'rgba(5, 5, 8, 0.6)' : 'transparent',
                backdropFilter: darken ? 'blur(16px)' : undefined,
            }}
        >
            <div className="menu-overlay-content">
                {title && (
                    <h1 className="menu-title">
                        <span style={{ color: uiAccentColor, opacity: 0.9 }}>{title}</span>
                    </h1>
                )}

                {subtitle && (
                    <div className="menu-subtitle">
                        {subtitle}
                    </div>
                )}

                {children && (
                    <div className="menu-children">
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
    const uiAccentColor = useGameStore(s => s.uiAccentColor)

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
            className="menu-btn"
            style={{
                background: baseColor,
                color: textColor,
                border: `2px solid ${borderColor}`,
                borderRadius: variant === 'danger' ? '50px' : '4px',
                boxShadow: variant === 'danger' ? '0 0 20px rgba(229, 57, 53, 0.3)' : `0 0 20px ${uiAccentColor}40`,
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
            <div className="press-space-text">
                Press Space
            </div>
        </MenuOverlay>
    )
}

export const PauseScreen: React.FC = () => {
    return (
        <MenuOverlay
            title="Standing By"
            subtitle="System Paused"
        >
            <div className="pause-screen-text">
                <span className="pause-screen-key">SPACE</span>
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
            <div className="game-over-panel">
                <div className="game-over-label">
                    Time on the Run
                </div>
                <div className="game-over-score">
                    {score.toFixed(2)}<span style={{ fontSize: '1.5rem' }}>s</span>
                </div>
            </div>

            <MenuButton variant="danger" onClick={onRestart}>
                Try Again
            </MenuButton>
            <div className="press-space-text">
                Press Space
            </div>
        </MenuOverlay>
    )
}
