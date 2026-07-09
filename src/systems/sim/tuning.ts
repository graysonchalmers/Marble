/**
 * systems/sim/tuning.ts — Box3D gameplay tuning constants (single source of truth).
 *
 * Working rule 3: battle-tested feel constants carry verbatim (docs/TUNING.md).
 * These values were previously scattered inline through Box3DScene.tsx and were
 * manually playtested on 2026-07-06 ("plays fine" — STATUS.md session log).
 *
 * NOTE / parity flag: docs/TUNING.md lists v1 (Cannon) values (gravity -22.5,
 * jumpForce 5, playerTopSpeed 20) that do NOT match the Box3D beta values below
 * (gravity -9.81, jump impulse 7.5, topSpeed 22). Do not "fix" either side
 * silently — this is a Phase E parity decision. Logged in STATUS.md.
 */

export const SIM_RATE_HZ = 60
export const FIXED_DT = 1 / SIM_RATE_HZ

export const WORLD = {
    gravityY: -9.81,
    /** Box3D solver sub-steps per fixed step. */
    subSteps: 4
} as const

export const TERRAIN = {
    width: 64,
    depth: 64,
    scale: 2,
    minHeight: -10.0,
    maxHeight: 10.0,
    friction: 0.5,
    restitution: 0.1,
    /** Outer boundary walls. */
    wallHeight: 50,
    wallThickness: 5
} as const

export const PLAYER = {
    radius: 0.5,
    density: 1.0,
    friction: 0.6,
    restitution: 0.2,
    linearDamping: 0.1,
    angularDamping: 0.4,
    spawn: { x: 0, y: 6, z: 0 },

    /** Input roll torque. */
    torque: 18.0,
    /** Torque multiplier when reversing spin direction (snappy turnarounds). */
    directionChangeBoost: 4.5,
    /** Torque scale while airborne. */
    airControl: 0.25,
    /** Counter-torque factor while braking (shift). */
    brakeTorqueFactor: 12.0,
    /** Linear impulse factor while braking. */
    brakeImpulseFactor: 0.15,
    /** Passive spin decay torque factor when no input on ground. */
    idleSpinDamping: 2.0,
    /** Horizontal speed soft cap (u/s). */
    topSpeed: 22,
    /** Exponential decay rate applied above topSpeed. */
    topSpeedDecayRate: 15,
    /** Upward jump impulse. */
    jumpImpulse: 7.5,
    /** Jump cooldown in sim seconds (was wall-clock setTimeout 400ms). */
    jumpCooldown: 0.4,
    /** Downward ground probe length. */
    groundProbe: 1.2
} as const

export const ENEMY = {
    friction: 0.8,
    restitution: 0.1,
    linearDamping: 0.8,
    angularDamping: 0.3,
    spawn: { x: 0, y: 20, z: -15 },

    /** Force = enemySpeed(setting) * stateSpeedMultiplier * this * groundControl. */
    forceFactor: 15,
    /** Vision raycast max distance (u). */
    visionDistance: 40,
    /** Extra probe length past enemy radius for grounding. */
    groundProbeExtra: 0.4,
    groundedFractionSlack: 0.2,
    /** Obstacle avoidance probe length past enemy radius. */
    avoidProbeExtra: 2.4,
    /** Avoidance steering deflection (rad) and strength. */
    avoidAngle: Math.PI / 3,
    avoidStrength: 20,
    /** Braking when velocity misaligned with heading. */
    brakeAlignmentThreshold: 0.3,
    brakeStrengthFactor: 0.5,
    minSpeedForBraking: 2,
    /** AI decision rate (s). Deterministic sim-time accumulator, not wall clock. */
    aiUpdateInterval: 0.1
} as const

export const RULES = {
    /** Tag when centers are closer than enemyRadius + playerRadius + this. */
    tagSlack: 0.1,
    /** Fall-off-world reset threshold (y). */
    fallResetY: -25
} as const

export const OBSTACLES = {
    /** Radius around the arena center kept clear of all obstacles (spawn zone). */
    clearRadius: 20,
    /** Obstacles scatter within this fraction of the terrain's full width/depth. */
    spawnAreaFactor: 0.8,
    friction: 0.6,
    restitution: 0.2
} as const

/* -------------------------------------------------------------------------- */
/* Physics feel presets (traction A/B — STATUS.md Known issue #4 + Phase E)    */
/* -------------------------------------------------------------------------- */

/**
 * The four physics values that govern ground traction / weight feel. The marble
 * is torque-driven, so forward grip = μ · N where N = m · gravity. Lower gravity
 * (Box3D beta's -9.81 vs v1's -22.5) means ~2.3× weaker friction grip while input
 * torque is unchanged → the "spins fast, grips slow" feel Grayson reported.
 *
 * Two independent levers raise grip: gravity (↑N, the v1-parity path) or friction
 * μ (↑grip directly, leaves jump/weight feel alone). Presets below isolate them.
 * Jump impulse is rescaled with gravity to hold jump *height* roughly constant
 * (h ≈ v²/2g, player mass ≈ 0.52 kg).
 */
export interface PhysicsFeel {
    /** World gravity (set at Box3DWorld creation — see Box3DScene). */
    gravityY: number
    /** Upward jump impulse (rescaled with gravity to keep jump height ~constant). */
    jumpImpulse: number
    /** Player sphere contact friction. */
    playerFriction: number
    /** Terrain + wall contact friction. */
    terrainFriction: number
}

export type PhysicsPresetName = 'current' | 'frictionOnly' | 'v1Gravity' | 'blend'

export const PHYSICS_PRESETS: Record<PhysicsPresetName, PhysicsFeel> = {
    /** Shipped Box3D beta baseline (matches the individual PLAYER/WORLD/TERRAIN values above). */
    current:      { gravityY: -9.81, jumpImpulse: 7.5,  playerFriction: 0.6,  terrainFriction: 0.5 },
    /** A — pure grip: keep beta weight, raise μ only. */
    frictionOnly: { gravityY: -9.81, jumpImpulse: 7.5,  playerFriction: 0.9,  terrainFriction: 0.8 },
    /** B — v1 parity: v1's heavy gravity, jump rescaled, μ unchanged. */
    v1Gravity:    { gravityY: -22.5, jumpImpulse: 11.3, playerFriction: 0.6,  terrainFriction: 0.5 },
    /** C — blend: moderate gravity + moderate μ. */
    blend:        { gravityY: -15.0, jumpImpulse: 9.3,  playerFriction: 0.75, terrainFriction: 0.65 }
} as const

export const DEFAULT_PHYSICS_PRESET: PhysicsPresetName = 'current'
