import { TERRAIN } from '../systems/sim/tuning'

/**
 * Utility for O(1) terrain height calculation based on the heightfield mathematical formula.
 * Centered at (0, 0). Dimensions sourced from tuning.ts TERRAIN (single source of truth).
 */
export function getTerrainHeight(worldX: number, worldZ: number): number {
    const { width, depth, scale } = TERRAIN

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

/**
 * Analytic surface normal at a world (x, z), from the central-difference gradient of
 * getTerrainHeight — the SAME source the sim's downhill-roll trusts (the WASM heightfield
 * raycast returns a flat up-normal, so we can't use it). Returns a unit vector.
 *
 * For a height field y = h(x, z), the upward surface normal is
 *   n = normalize(-∂h/∂x, 1, -∂h/∂z).
 * `eps` is the sampling half-step (0.75u matches the downhill-roll probe).
 */
export function getTerrainNormal(
    worldX: number,
    worldZ: number,
    eps = 0.75
): { x: number; y: number; z: number } {
    const dhdx = (getTerrainHeight(worldX + eps, worldZ) - getTerrainHeight(worldX - eps, worldZ)) / (2 * eps)
    const dhdz = (getTerrainHeight(worldX, worldZ + eps) - getTerrainHeight(worldX, worldZ - eps)) / (2 * eps)
    const nx = -dhdx
    const ny = 1
    const nz = -dhdz
    const len = Math.hypot(nx, ny, nz)
    return { x: nx / len, y: ny / len, z: nz / len }
}
