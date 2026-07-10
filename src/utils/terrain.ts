import { TERRAIN, OBSTACLES, DEFAULT_TERRAIN_ROUGHNESS } from '../systems/sim/tuning'

/**
 * utils/terrain.ts — the ONE source of truth for terrain height.
 *
 * `getTerrainHeight(x, z)` is sampled by everything that must agree on the ground:
 * the collider heightfield + the render mesh (both via `generateTerrainHeights`),
 * obstacle placement, obstacle tilt (`getTerrainNormal`), and the sim's downhill roll.
 * Previously the height array was a hand-copied second formula living in Box3DScene;
 * Feature B unified them here so a change (like the roughness field below) lands
 * everywhere consistently.
 */

/* --------------------------------------------------------------------------- */
/* Variable-floor roughness (Feature B)                                         */
/* --------------------------------------------------------------------------- */

// Roughness amplitude — module-level so every consumer of getTerrainHeight reads ONE value.
// Set from the store at (re)build time via setTerrainRoughness; the default keeps headless
// tests deterministic without any wiring.
let roughnessAmp = DEFAULT_TERRAIN_ROUGHNESS

/** Set the variable-floor roughness amplitude (0 = flat). Called by the scene at build time. */
export function setTerrainRoughness(amp: number): void {
    roughnessAmp = Number.isFinite(amp) ? Math.max(0, amp) : 0
}

/** Current roughness amplitude (for tests / debug). */
export function getTerrainRoughness(): number {
    return roughnessAmp
}

/** Peak height (u) of a full-strength bump — small so bumps stay navigable, not walls. */
const ROUGHNESS_BUMP_HEIGHT = 0.55

function clamp01(x: number): number {
    return x < 0 ? 0 : x > 1 ? 1 : x
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp01((x - edge0) / (edge1 - edge0))
    return t * t * (3 - 2 * t)
}

/**
 * Masked ground roughness at a world (x, z), in world units. Three factors, all pure:
 *  - a low-frequency **patch mask** carves the arena into smooth zones (0) and rough zones (1),
 *  - a multi-frequency **ripple** (wavelengths ~2.7–4.5u, all above the downhill probe's 0.75u
 *    step so it reads as terrain, and ≥2u so the heightfield collider resolves it) roughens
 *    the rough zones, and
 *  - a **radial gate** keeps the spawn ring (inside OBSTACLES.clearRadius) perfectly smooth.
 * Returns 0 when roughness is off or outside a rough patch. Deterministic function of (x, z).
 */
export function terrainRoughnessAt(worldX: number, worldZ: number): number {
    if (roughnessAmp <= 0) return 0

    // Radial gate: 0 inside the clear radius, ramps to 1 over the next 8u.
    const gate = smoothstep(OBSTACLES.clearRadius, OBSTACLES.clearRadius + 8, Math.hypot(worldX, worldZ))
    if (gate <= 0) return 0

    // Patch mask: rough only where a slow sine field runs high → a few big rough zones.
    const maskField = Math.sin(worldX * 0.06) * Math.sin(worldZ * 0.06)
    const mask = clamp01((maskField - 0.1) * 3)
    if (mask <= 0) return 0

    // Ripple: multi-frequency navigable bumps.
    const ripple =
        Math.sin(worldX * 1.6) * Math.cos(worldZ * 1.4) +
        0.5 * Math.sin((worldX + worldZ) * 2.3)

    return roughnessAmp * gate * mask * ripple * ROUGHNESS_BUMP_HEIGHT
}

/* --------------------------------------------------------------------------- */
/* Base terrain height + normal                                                 */
/* --------------------------------------------------------------------------- */

/**
 * Utility for O(1) terrain height calculation based on the heightfield mathematical formula.
 * Centered at (0, 0). Dimensions sourced from tuning.ts TERRAIN (single source of truth).
 * The variable-floor roughness field (above) rides on top so every consumer agrees.
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

    // Hillier terrain formula from Level.tsx + the variable-floor roughness field.
    const base = Math.sin(xn * 1.5) * Math.cos(zn * 1.5) * 2.5 + Math.sin(xn * 4 + zn * 2) * 0.8
    return base + terrainRoughnessAt(worldX, worldZ)
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

/* --------------------------------------------------------------------------- */
/* Height array for the collider + render mesh (single source of truth)         */
/* --------------------------------------------------------------------------- */

/**
 * Row-major (countX * countZ) height array feeding BOTH the collider heightfield and the
 * render mesh. Samples getTerrainHeight at each grid vertex's world position, so the collider
 * surface, visual mesh, obstacle placement, and downhill-roll all agree — and the roughness
 * field rides along automatically. (Was a hand-copied second formula in Box3DScene; unified
 * here as part of Feature B.)
 */
export function generateTerrainHeights(): Float32Array {
    const { width, depth, scale } = TERRAIN
    const heights = new Float32Array(width * depth)
    const halfW = ((width - 1) * scale) / 2
    const halfD = ((depth - 1) * scale) / 2
    let i = 0
    for (let gz = 0; gz < depth; gz++) {
        for (let gx = 0; gx < width; gx++) {
            heights[i++] = getTerrainHeight(gx * scale - halfW, gz * scale - halfD)
        }
    }
    return heights
}
