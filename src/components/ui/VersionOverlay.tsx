import { useState } from 'react';
import { CHANGELOG, CURRENT_VERSION } from '../../data/changelog';
import { useGameStore } from '../../store/useGameStore';

export function VersionOverlay() {
    const [isOpen, setIsOpen] = useState(false);
    const uiAccentColor = useGameStore(s => s.uiAccentColor);

    return (
        <>
            {/* Version Trigger Button in Bottom Right */}
            <button
                className="version-trigger"
                onClick={() => setIsOpen(true)}
                aria-label="View Changelog"
            >
                {CURRENT_VERSION}
            </button>

            {/* Modal Overlay */}
            {isOpen && (
                <div className="changelog-modal-overlay" onClick={() => setIsOpen(false)}>
                    {/* Modal Content - stop propagation so clicking inside doesn't close it */}
                    <div className="changelog-modal-content" onClick={(e) => e.stopPropagation()}>
                        
                        <div className="changelog-header">
                            <h2 style={{ color: uiAccentColor }}>Release Notes</h2>
                            <button className="changelog-close" onClick={() => setIsOpen(false)} aria-label="Close Changelog">
                                ✕
                            </button>
                        </div>

                        <div className="changelog-list">
                            {CHANGELOG.map((entry, index) => (
                                <div key={entry.version} className={`changelog-entry ${index === 0 ? 'current-version' : ''}`}>
                                    <div className="changelog-entry-header">
                                        <span className="changelog-version" style={{ color: index === 0 ? uiAccentColor : 'white' }}>
                                            {entry.version}
                                        </span>
                                        <span className="changelog-date">{entry.date}</span>
                                    </div>
                                    <ul className="changelog-items">
                                        {entry.changes.map((change, i) => (
                                            <li key={i}>{change}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
