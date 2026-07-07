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
