/**
 * Utility for O(1) terrain height calculation based on the heightfield mathematical formula.
 * Centered at (0, 0) with width 64, depth 64, and scale 2.
 */
export function getTerrainHeight(worldX: number, worldZ: number): number {
    const width = 64
    const depth = 64
    const scale = 2
    
    // Convert world coordinates to grid coordinates (0..63)
    const x = (worldX + (width * scale) / 2) / scale
    const z = (worldZ + (depth * scale) / 2) / scale
    
    // Clamp to heightfield bounds
    const clampedX = Math.max(0, Math.min(width - 1, x))
    const clampedZ = Math.max(0, Math.min(depth - 1, z))
    
    // Normalize coordinates matching Level.tsx
    const xn = (clampedX / width) * 5
    const zn = (clampedZ / depth) * 5
    
    // Hillier terrain formula from Level.tsx
    return Math.sin(xn * 1.5) * Math.cos(zn * 1.5) * 2.5 + Math.sin(xn * 4 + zn * 2) * 0.8
}
