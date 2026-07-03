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

const renderRecordsTable = (records: Array<{ date: string, timeAlive: number }>, currentScore?: number) => {
    if (!records || records.length === 0) return null;

    return (
        <table className="records-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Date</th>
                    <th>Time</th>
                </tr>
            </thead>
            <tbody>
                {records.map((r, i) => {
                    const isCurrentRun = currentScore !== undefined && Math.abs(r.timeAlive - currentScore) < 0.001;
                    return (
                        <tr 
                            key={i} 
                            style={isCurrentRun ? { 
                                background: 'rgba(229, 57, 53, 0.15)', 
                                borderLeft: '3px solid #ffcc00' 
                            } : undefined}
                        >
                            <td style={{ 
                                color: isCurrentRun ? '#ffcc00' : (i === 0 ? '#ffcc00' : 'rgba(255,255,255,0.4)'),
                                fontWeight: isCurrentRun ? 'bold' : 'normal'
                            }}>
                                #{i + 1} {isCurrentRun && "(You)"}
                            </td>
                            <td style={{ fontWeight: isCurrentRun ? 'bold' : 'normal' }}>{r.date}</td>
                            <td style={{ fontWeight: 'bold', color: isCurrentRun ? '#ffcc00' : 'white' }}>{r.timeAlive.toFixed(2)}s</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

export const PauseScreen: React.FC = () => {
    const score = useGameStore(s => s.score)
    const personalRecords = useGameStore(s => s.personalRecords)

    return (
        <MenuOverlay
            title="Standing By"
            subtitle={
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div>System Paused</div>
                    <div style={{ fontSize: '1.25rem', marginTop: '8px', color: '#ffcc00', fontWeight: 800 }}>
                        Currently at: {score.toFixed(2)}s
                    </div>
                    <div style={{ fontSize: '0.95rem', marginTop: '4px', fontStyle: 'italic', color: 'rgba(255, 255, 255, 0.6)' }}>
                        Keep climbing! 🏔️
                    </div>
                </div>
            }
        >
            <div className="pause-screen-text" style={{ marginBottom: '10px' }}>
                <span className="pause-screen-key">SPACE</span>
                to Resume
            </div>

            {personalRecords.length > 0 && (
                <div style={{ marginTop: '20px', width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', alignSelf: 'flex-start', paddingLeft: '12px' }}>
                        Personal Bests
                    </div>
                    {renderRecordsTable(personalRecords.slice(0, 3))}
                </div>
            )}
        </MenuOverlay>
    )
}

export const GameOverScreen: React.FC<{ score: number, onRestart: () => void }> = ({ score, onRestart }) => {
    const isNewRecord = useGameStore(s => s.isNewRecord)
    const personalRecords = useGameStore(s => s.personalRecords)

    // Find the rank (1-indexed) in the full top records list
    const currentRank = personalRecords.findIndex(r => Math.abs(r.timeAlive - score) < 0.001) + 1;

    return (
        <MenuOverlay
            title={isNewRecord ? "New Record!" : "Tagged!"}
            darken={true}
        >
            <div className="game-over-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className="game-over-label">
                    Time on the Run
                </div>
                <div className="game-over-score" style={{ color: isNewRecord ? '#ffcc00' : 'white' }}>
                    {score.toFixed(2)}<span style={{ fontSize: '1.2rem' }}>s</span>
                </div>
                {currentRank > 0 ? (
                    <div style={{ fontSize: '1.15rem', marginTop: '6px', color: '#ffcc00', fontWeight: 'bold', letterSpacing: '1px' }}>
                        POSITION #{currentRank}
                    </div>
                ) : (
                    <div style={{ fontSize: '0.95rem', marginTop: '6px', color: 'rgba(255, 255, 255, 0.4)' }}>
                        Rank: Unranked (Top 10)
                    </div>
                )}
                {isNewRecord && (
                    <div className="new-pb-badge" style={{ marginTop: '12px' }}>
                        ✨ NEW PERSONAL BEST! ✨
                    </div>
                )}
            </div>

            <div style={{ margin: '20px 0' }}>
                <MenuButton variant="danger" onClick={onRestart}>
                    Try Again
                </MenuButton>
                <div className="press-space-text" style={{ marginTop: '10px' }}>
                    Press Space
                </div>
            </div>

            {personalRecords.length > 0 && (
                <div style={{ marginTop: '25px', width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', alignSelf: 'flex-start', paddingLeft: '12px' }}>
                        Top Runs
                    </div>
                    {renderRecordsTable(personalRecords.slice(0, 5), score)}
                </div>
            )}
        </MenuOverlay>
    )
}
