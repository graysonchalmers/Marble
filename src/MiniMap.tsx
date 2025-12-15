interface MiniMapProps {
    playerPos: { x: number; z: number }
    enemyPos: { x: number; z: number }
    mapSize?: number
    worldSize?: number
}

export function MiniMap({ playerPos, enemyPos, mapSize = 100, worldSize = 128 }: MiniMapProps) {
    // Convert world coords to map coords
    // World is centered at 0, ranges from -worldSize/2 to +worldSize/2
    const toMapCoord = (worldCoord: number) => {
        return ((worldCoord + worldSize / 2) / worldSize) * mapSize
    }

    const playerX = toMapCoord(playerPos.x)
    const playerY = toMapCoord(playerPos.z) // Z in 3D → Y in 2D map
    const enemyX = toMapCoord(enemyPos.x)
    const enemyY = toMapCoord(enemyPos.z)

    return (
        <div style={{
            width: mapSize,
            height: mapSize,
            background: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
            {/* Grid lines */}
            <svg width={mapSize} height={mapSize} style={{ position: 'absolute', opacity: 0.2 }}>
                <line x1={mapSize / 2} y1={0} x2={mapSize / 2} y2={mapSize} stroke="white" strokeWidth={1} />
                <line x1={0} y1={mapSize / 2} x2={mapSize} y2={mapSize / 2} stroke="white" strokeWidth={1} />
            </svg>

            {/* Enemy dot (red) */}
            <div style={{
                position: 'absolute',
                left: enemyX - 4,
                top: enemyY - 4,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#ff4444',
                boxShadow: '0 0 6px #ff4444',
                transition: 'left 0.1s, top 0.1s'
            }} />

            {/* Player dot (cyan) */}
            <div style={{
                position: 'absolute',
                left: playerX - 5,
                top: playerY - 5,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#00ffcc',
                boxShadow: '0 0 8px #00ffcc',
                border: '1px solid white',
                transition: 'left 0.1s, top 0.1s'
            }} />

            {/* Label */}
            <div style={{
                position: 'absolute',
                bottom: 2,
                right: 4,
                fontSize: '8px',
                color: 'rgba(255,255,255,0.4)',
                fontFamily: "'JetBrains Mono', monospace"
            }}>
                MAP
            </div>
        </div>
    )
}
