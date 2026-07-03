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
        <div className="minimap-container" style={{ width: mapSize, height: mapSize }}>
            {/* Grid lines */}
            <svg width={mapSize} height={mapSize} className="minimap-grid">
                <line x1={mapSize / 2} y1={0} x2={mapSize / 2} y2={mapSize} stroke="white" strokeWidth={1} />
                <line x1={0} y1={mapSize / 2} x2={mapSize} y2={mapSize / 2} stroke="white" strokeWidth={1} />
            </svg>

            {/* Enemy dot (red) */}
            <div className="minimap-enemy-dot" style={{ left: enemyX - 4, top: enemyY - 4 }} />

            {/* Player dot (cyan) */}
            <div className="minimap-player-dot" style={{ left: playerX - 5, top: playerY - 5 }} />

            {/* Label */}
            <div className="minimap-label">
                MAP
            </div>
        </div>
    )
}
