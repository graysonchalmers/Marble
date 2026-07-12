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

    /** Upward jump impulse — vestigial (velocity model derives impulse from jumpHeight); retained for the PhysicsFeel preset contract + its parity test. */
    jumpImpulse: 7.5,
    /**
     * Target jump apex height in world units (velocity model). Impulse is derived
     * per-preset from this + gravity + mass so jump *height* stays constant across
     * gravity presets: v = sqrt(2·|g|·h), impulse = mass·v. Default clears the
     * enemy ball (~1.8u diameter incl. margin) but never summits the 7u cubes.
     */
    jumpHeight: 1.8,
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
    /** AI decision rate (s). Deterministic sim-time accumulator, not wall clock. */
    aiUpdateInterval: 0.1,

    /* --- Velocity model (mirrors the player's velocity drive) --- */
    /**
     * Enemy top speed (u/s) = enemySpeed(setting) · stateSpeedMultiplier · velUnit.
     * At default enemySpeed 2: chase(1.5)=19.5, search(1.2)=15.6, alert(0.1)=1.3, idle(0)=0.
     * Chase sits just under the player's 20 u/s so a clean run can barely open a gap —
     * predictive interception (getMovementTarget) closes it. Raise for more pressure.
     */
    velUnit: 6.5,
    /** Acceleration toward the target velocity (u/s²). */
    velAccel: 45
} as const

export const RULES = {
    /** Tag when centers are closer than enemyRadius + playerRadius + this. */
    tagSlack: 0.1,
    /** Fall-off-world reset threshold (y). */
    fallResetY: -25
} as const

/** Cosmetic FX thresholds (drive render-only particle bursts; never affect the sim). */
export const FX = {
    /** Single-step horizontal speed drop (u/s) that counts as an impact (wall/cube hit). */
    impactSpeedDrop: 6,
    /** Downward speed (u/s) at touchdown that counts as a hard landing. */
    landSpeed: 5,
    /** Player speed (u/s) above which roll trails start emitting. */
    trailMinSpeed: 6,
    /**
     * Enemy leaves a fading ground breadcrumb "scent trail" so you can read where it's
     * been. Drop one mark per this much enemy travel (u). Lower = denser trail.
     */
    enemyTrailSpacing: 1.4,
    /** Seconds a ground breadcrumb mark lingers before it fades out. */
    enemyTrailLife: 5.0
} as const

export const OBSTACLES = {
    /** Radius around the arena center kept clear of all obstacles (spawn zone). */
    clearRadius: 20,
    /** Obstacles scatter within this fraction of the terrain's full width/depth. */
    spawnAreaFactor: 0.8,
    friction: 0.6,
    restitution: 0.2,
    /**
     * Depth (metres) each static obstacle (cube / column / crumble block) is sunk BELOW its
     * flush-on-terrain resting height, so its base is buried in the ground instead of showing
     * a floating bottom edge. Collider + visual share the same lowered Y (set in placement), so
     * it stays coherent. Props (dynamic) are NOT sunk — they roll.
     */
    sink: 0.5
} as const

/* -------------------------------------------------------------------------- */
/* Physics Playground (Phase P) — scattered props + variable-floor roughness   */
/* -------------------------------------------------------------------------- */

/**
 * Scattered knock-around props (Feature A) — the ONE dynamic primitive the Box3D bridge
 * has is a sphere, so props are dynamic spheres. Visual is a faceted rubble chunk (varied
 * size) so they read as debris you plow through, not a ball pit. They share the obstacle
 * seeded scatter + clear radius, drop onto the terrain, and are knocked by the player/enemy.
 */
export const PROPS = {
    density: 0.6,           // dynamic-sphere density (mass ∝ r³·density) — light so they scatter readily
    friction: 0.5,
    restitution: 0.35,      // slightly bouncy so knocks read
    linearDamping: 0.2,
    angularDamping: 0.35,
    /** Per-prop collider radius range (seeded) — varied so it reads as rubble, not uniform balls. */
    minRadius: 0.35,
    maxRadius: 0.85,
    /** Spawn height above the terrain surface so props fall in and settle. */
    dropHeight: 1.5
} as const

/**
 * Crumble / crashable scenery (Feature C — "fake" in-sandbox path, no WASM).
 * A crumble block is a solid STATIC box (like a cube) until a fast-moving hitter
 * (player or enemy) crashes into it; then the block is parked out of the world and
 * bursts into a spray of DYNAMIC-SPHERE debris (the only dynamic primitive the bridge
 * has) with seeded outward impulses. Debris renders as blocky/elongated shards riding
 * the sphere colliders (the columns-as-cylinders trick) with heavy angular damping so
 * they settle rather than roll forever. Fully deterministic: the smash trigger reads
 * sim state and every debris value is drawn from the seeded RNG stream, so a replay
 * reproduces the same collapse (F9-safe). Blocks reform on round reset.
 */
export const CRUMBLE = {
    /** Crumble-block edge length (static box — a breakable "crate"). Halved 4→2 (s24) to match
        the shrunk cubes/columns; smash tests read this symbolically so they track it. */
    scale: 2,
    /** A hitter must be moving at least this fast (u/s, full 3D speed) to smash a block. */
    smashSpeed: 9,
    /** Extra margin on the sphere-vs-box contact test (u) so a solid hit registers. */
    contactMargin: 0.25,
    /** Debris chunks spawned per smashed block. */
    debrisPerBlock: 24,
    /** Hard cap on simultaneously-live debris bodies (retire oldest beyond this) — perf guard.
     *  Sized so ~10 blocks can burst near-simultaneously (10 × debrisPerBlock) before the
     *  retire-oldest guard kicks in, so a busy multi-block smash still shows all its shards. */
    maxLiveDebris: 240,
    /** Debris base size range (seeded) — the shard's box dims derive from this; small = rubble. */
    minDebrisRadius: 0.3,
    maxDebrisRadius: 0.55,
    /** Outward burst speed range for debris (seeded, u/s). */
    burstSpeedMin: 6,
    burstSpeedMax: 12,
    /** Upward pop added to every debris burst so it sprays up, not just skitters out (u/s). */
    burstUp: 5,
    /** Seeded spin magnitude range applied to each shard (rad/s) — visual tumble. */
    spinMin: 4,
    spinMax: 12,
    /** Debris physics (light + high angular damping so shards settle stubbily). */
    density: 0.6,
    friction: 0.6,
    restitution: 0.2,
    linearDamping: 0.25,
    angularDamping: 2.5,
    /** Y a smashed block is parked at — far below the arena, out of all play/rays. */
    parkY: -900
} as const

/**
 * Default crumble-block count (Phase P Feature C). Set for a lively field of crashable crates
 * (Grayson: "lots more of them") — big enough to always have something to plow through, still
 * clean. Live-tunable 0–40 via the `crumbleCount` store key (Settings → Environment).
 * 0 = off (and keeps every crumble body out of the world).
 */
export const DEFAULT_CRUMBLE_COUNT = 12

/**
 * Variable-floor roughness (Feature B) — default amplitude of the masked ground bumps
 * (0 = flat). Bumps are ≥~2u wavelength so the 64×64 @2u heightfield collider actually
 * resolves them; both player and enemy feel them. Live-tunable via the `terrainRoughness`
 * store key (Settings → Environment). See utils/terrain.ts for the roughness field.
 */
export const DEFAULT_TERRAIN_ROUGHNESS = 0.6

/* -------------------------------------------------------------------------- */
/* Physics feel presets (traction A/B — STATUS.md Known issue #4 + Phase E)    */
/* -------------------------------------------------------------------------- */

/**
 * Physics-feel presets — the surviving lever under the velocity model is GRAVITY
 * (it drives fall speed, jump-impulse rescale, and downhill roll). Friction is now
 * largely vestigial (velocity control overrides grounded traction) but retained on
 * the preset so collisions/airborne contact stay tuned and the contract is complete.
 * Jump impulse is rescaled with gravity to hold jump *height* roughly constant
 * (h ≈ v²/2g, player mass ≈ 0.52 kg).
 *
 * These carry the gravity variety the Play-Feel presets compose (Arcade=current light,
 * Heavyweight=v1Gravity heavy, Classic/Ice/Predator=blend). The `frictionOnly` A/B
 * preset was retired session 12 — under the velocity model it was a no-op duplicate
 * of `current` (same gravity; friction ignored while grounded).
 */
export interface PhysicsFeel {
    /** World gravity (set at Box3DWorld creation — see Box3DScene). */
    gravityY: number
    /** Upward jump impulse (rescaled with gravity to keep jump height ~constant). */
    jumpImpulse: number
    /** Player sphere contact friction (vestigial under velocity model — collisions/airborne only). */
    playerFriction: number
    /** Terrain + wall contact friction (vestigial under velocity model). */
    terrainFriction: number
}

export type PhysicsPresetName = 'current' | 'v1Gravity' | 'blend'

export const PHYSICS_PRESETS: Record<PhysicsPresetName, PhysicsFeel> = {
    /** Light: Box3D beta baseline gravity (matches the individual PLAYER/WORLD/TERRAIN values above). */
    current:      { gravityY: -9.81, jumpImpulse: 7.5,  playerFriction: 0.6,  terrainFriction: 0.5 },
    /** Heavy: v1 parity — v1's heavy gravity, jump rescaled to hold height. */
    v1Gravity:    { gravityY: -22.5, jumpImpulse: 11.3, playerFriction: 0.6,  terrainFriction: 0.5 },
    /** Blend: moderate gravity — the tuned default baseline. */
    blend:        { gravityY: -15.0, jumpImpulse: 9.3,  playerFriction: 0.75, terrainFriction: 0.65 }
} as const

export const DEFAULT_PHYSICS_PRESET: PhysicsPresetName = 'current'

/* -------------------------------------------------------------------------- */
/* Movement (velocity-driven — the sole model since session 12)                */
/* -------------------------------------------------------------------------- */

/**
 * Player input drives horizontal velocity DIRECTLY (accel toward a target, capped
 * at top speed), and spin is slaved to motion (ω = v/r) so the ball rolls 1:1 with
 * the ground, no slip. Airborne hands back to Box3D physics. This is the target
 * feel Grayson signed off on ("influence the ball from inside with energy; grip is
 * implicit"). The legacy torque model (input=spin, friction converts it) was retired
 * in session 12 after the velocity model won the Known-#4 A/B decisively.
 */
export const MOVEMENT = {
    /** Horizontal top speed (u/s). */
    topSpeed: 20,
    /** Acceleration toward target velocity while input held (u/s²). Higher = snappier turns/starts. */
    accel: 60,
    /** Stronger deceleration while braking (shift) (u/s²). */
    brakeDecel: 90,
    /** Midair steering authority as a fraction of `accel` (0 = none, physics only). */
    airControl: 0.15,

    /* --- Coast / drift (no input, grounded) --- */
    /**
     * On release the ball coasts: velocity decays by exponential drag (inertia glide)
     * plus a small constant floor so it fully settles to rest on flat ground. The drag
     * rate k is interpolated by `driftAmount` (0..1):
     *   driftAmount 0 → k = coastDragMax  (strong drag, quick stop — old snappy feel)
     *   driftAmount 1 → k = coastDragMin  (weak drag, long floaty glide)
     * Exponential (not fixed-rate) decay is what lets downhill roll survive: a fixed
     * decel would always cancel the slope pull. Terminal downhill speed = (aDown−floor)/k.
     */
    coastDragMax: 9.0,
    coastDragMin: 0.7,
    /** Constant coast decel (u/s²): guarantees rest on flat + sets the min slope that rolls. */
    coastFloor: 0.6,

    /* --- Downhill roll (no input, grounded, on a slope) --- */
    /**
     * When coasting on a slope, the ball accelerates downhill by g·sinθ scaled by
     * `downhillRoll` (0..1 = fraction of true gravity along the surface). Read from
     * the ground contact normal, so it works on terrain AND on top of cubes.
     */
    downhillMaxSpeed: 16
} as const

/**
 * The ENEMY runs the SAME velocity drive as the player (Grayson: "same idea"): drive
 * horizontal velocity toward heading·targetSpeed and slave spin to motion. The legacy
 * force-steering model was retired in session 12 alongside the player torque model.
 */

/** Coast/drift + downhill defaults (mirrored into the settings store as live sliders). */
export const DEFAULT_DRIFT = 0.55
export const DEFAULT_DOWNHILL_ROLL = 0.7

/* -------------------------------------------------------------------------- */
/* Play-feel presets — one-click bundles of the feel knobs, with character.     */
/* -------------------------------------------------------------------------- */

/**
 * A play-feel preset composes the existing primitives (physics preset + drift +
 * downhill + jump + enemy speed) into a named, characterful set. Selecting one
 * writes those store values; nudging any of them afterward flips the preset to
 * `custom` (same pattern as the graphics preset). `classic` MUST equal the
 * DEFAULT_SETTINGS feel values so a fresh install reads as "Classic".
 */
export interface PlayfeelPreset {
    label: string
    blurb: string
    physicsPreset: PhysicsPresetName
    playerDrift: number
    downhillRoll: number
    jumpHeight: number
    enemySpeed: number
}

export type PlayfeelPresetName = 'classic' | 'iceRink' | 'arcade' | 'heavyweight' | 'predator'

export const PLAYFEEL_PRESETS: Record<PlayfeelPresetName, PlayfeelPreset> = {
    classic:     { label: 'Classic',     blurb: 'Balanced blend — the tuned default.',            physicsPreset: 'blend',     playerDrift: 0.55, downhillRoll: 0.70, jumpHeight: 1.8, enemySpeed: 2.0 },
    iceRink:     { label: 'Ice Rink',    blurb: 'Slippery: long glides, strong downhill roll.',    physicsPreset: 'blend',     playerDrift: 0.92, downhillRoll: 1.00, jumpHeight: 1.6, enemySpeed: 2.0 },
    arcade:      { label: 'Arcade',      blurb: 'Light + snappy: quick stops, punchy jump.',       physicsPreset: 'current',   playerDrift: 0.20, downhillRoll: 0.45, jumpHeight: 2.2, enemySpeed: 2.6 },
    heavyweight: { label: 'Heavyweight', blurb: 'Heavy gravity, grounded, low floaty jump.',       physicsPreset: 'v1Gravity', playerDrift: 0.30, downhillRoll: 0.55, jumpHeight: 1.3, enemySpeed: 2.0 },
    predator:    { label: 'Predator',    blurb: 'Classic feel, relentless enemy. Hard mode.',      physicsPreset: 'blend',     playerDrift: 0.55, downhillRoll: 0.70, jumpHeight: 1.8, enemySpeed: 3.2 }
} as const

export const DEFAULT_PLAYFEEL_PRESET: PlayfeelPresetName = 'classic'

/** Store keys a play-feel preset owns — changing any of these flips the preset to `custom`. */
export const PLAYFEEL_KEYS = ['physicsPreset', 'playerDrift', 'downhillRoll', 'jumpHeight', 'enemySpeed'] as const
