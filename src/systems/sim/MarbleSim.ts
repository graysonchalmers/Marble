/**
 * systems/sim/MarbleSim.ts — headless Box3D gameplay simulation.
 *
 * Owns the full per-step gameplay logic that previously lived inside
 * Box3DScene.tsx's useFrame: player input forces, jump, enemy AI decisions,
 * steering + avoidance, tag detection, fall resets, and the physics step.
 *
 * Design rules (ARCHITECTURE §4):
 * - Fixed timestep only: `step(FIXED_DT, ...)` — never a render delta.
 * - Zero React imports, zero store imports, zero audio imports. Side effects
 *   surface through the `SimEvents` callbacks so tests can run fully headless.
 * - Zero allocations in the step hot path (scratch vectors preallocated).
 * - Deterministic given identical inputs AND an identical `config.seed`: all
 *   sim randomness (obstacle scatter, AI search waypoints) draws from one
 *   seeded mulberry32 stream — no Math.random() anywhere in the sim.
 *
 * Render interpolation: the sim keeps prev/curr transform snapshots for both
 * bodies. The scene lerps prev→curr by the loop's accumulator alpha.
 */

import * as THREE from 'three'
import type { Box3DWorld } from '../../physics/box3d/Box3DWorld'
import {
    createAIState,
    updateAIState,
    getSpeedMultiplier,
    getMovementTarget,
    type EnemyAIState,
    type EnemyState
} from '../ai/EnemyAI'
import {
    TERRAIN, PLAYER, ENEMY, RULES, OBSTACLES, PROPS, CRUMBLE, PHYSICS_PRESETS, DEFAULT_PHYSICS_PRESET,
    MOVEMENT, DEFAULT_DRIFT, DEFAULT_DOWNHILL_ROLL, FX
} from './tuning'
import type { PhysicsFeel } from './tuning'
import { getTerrainHeight, getTerrainNormal } from '../../utils/terrain'
import { mulberry32, DEFAULT_SIM_SEED } from './rng'
import { computeEjection } from './unstick'

/** World up — obstacles tilt from this toward the local terrain normal. */
const WORLD_UP = new THREE.Vector3(0, 1, 0)

export interface SimInput {
    w: boolean
    a: boolean
    s: boolean
    d: boolean
    space: boolean
    shift: boolean
}

/** Live-tunable settings, read every step (mirrors the settings store). */
export interface SimParams {
    enemySpeed: number
    enemyAirControl: number
    /** Coast glide/inertia on release, 0 (snappy stop) .. 1 (long glide). Default DEFAULT_DRIFT. */
    playerDrift?: number
    /** Downhill roll strength when coasting on a slope, 0 (off) .. 1 (full gravity). Default DEFAULT_DOWNHILL_ROLL. */
    downhillRoll?: number
    /** Target jump apex height (u). Impulse derived from height + gravity + mass. Default PLAYER.jumpHeight. */
    jumpHeight?: number
    /** Player velocity-model knobs (live). Omit → tuning.ts MOVEMENT.* defaults (keeps callers/tests byte-identical). */
    moveTopSpeed?: number
    moveAccel?: number
    moveBrakeDecel?: number
    moveAirControl?: number
    /** Enemy velocity-drive knobs (live). Omit → tuning.ts ENEMY.velUnit / velAccel defaults. */
    enemyVelUnit?: number
    enemyVelAccel?: number
    /**
     * Countdown early-release: when true, the player is fully live but the enemy is
     * pinned at its spawn (no AI, no movement, no tagging) so the player can take a
     * head start while the countdown timer runs out. Default false (normal play).
     */
    freezeEnemy?: boolean
}

/** Minimal shape of a Box3D linear/angular velocity read. */
interface Vec3Like { x: number; y: number; z: number }

export interface SimEvents {
    /** Fired once when the enemy first tags the player (edge-triggered). */
    onTag?: () => void
    /** Fired on AI state transitions (for sounds + HUD). */
    onAIStateChange?: (prev: EnemyState, next: EnemyState) => void
    /** Cosmetic: player just touched down hard after a fall (impactSpeed = |downward v|). Render-only. */
    onLand?: (x: number, y: number, z: number, impactSpeed: number) => void
    /** Cosmetic: player's horizontal speed dropped sharply in one step (hit a wall/cube). Render-only. */
    onImpact?: (x: number, y: number, z: number, strength: number) => void
}

/** Static obstacle scatter settings (Gate 1: cubes, Gate 2: columns). Omit for no obstacles. */
export interface ObstacleConfig {
    cubeCount: number
    cubeScale: number
    columnCount: number
    columnSize: number
    columnHeight: number
    /**
     * Phase P Feature A: scattered dynamic knock-around props (dynamic spheres). Optional +
     * defaults to 0 so every existing caller/test stays byte-identical (no props unless asked).
     */
    propCount?: number
    /**
     * Phase P Feature C: crashable "crumble" blocks — static boxes that burst into dynamic-sphere
     * debris when a fast hitter crashes through. Optional + defaults to 0 so existing callers/tests
     * stay byte-identical (no crumble bodies + no extra RNG draws unless asked).
     */
    crumbleCount?: number
}

export interface BodySnapshot {
    position: THREE.Vector3
    quaternion: THREE.Quaternion
}

export interface MarbleSimConfig {
    /** Row-major heights (countX * countZ). Omit for a flat 200x1x200 test slab. */
    heights?: Float32Array
    enemySize: number
    enemyMass: number
    playerSpawn?: { x: number; y: number; z: number }
    enemySpawn?: { x: number; y: number; z: number }
    events?: SimEvents
    /** Static obstacle scatter (cubes + columns). Omitted/zero counts = no obstacles. */
    obstacles?: ObstacleConfig
    /**
     * Seed for ALL sim randomness (obstacle scatter + AI search waypoints).
     * Record this alongside scripted input to reproduce a run exactly (F9).
     * Defaults to DEFAULT_SIM_SEED for headless/test determinism.
     */
    seed?: number
    /**
     * Physics feel values (player/terrain friction + jump impulse). Gravity in this
     * object is set at Box3DWorld creation by the scene, NOT here. Omit for the
     * shipped `current` preset — keeps existing callers/tests byte-identical.
     */
    physics?: PhysicsFeel
}

const NO_INPUT: SimInput = { w: false, a: false, s: false, d: false, space: false, shift: false }

// Un-embed safety net: horizontal ejection speed + upward pop applied when the ball is
// found INSIDE a static obstacle collider (see MarbleSim.ejectFromObstacle). Tuned to eject
// decisively over a couple of steps without launching the ball across the arena.
const EJECT_SPEED = 12
const EJECT_UP = 4

export class MarbleSim {
    readonly world: Box3DWorld
    readonly playerBodyPtr: number
    readonly enemyBodyPtr: number
    readonly enemySize: number
    /** The seed this sim was built with — persist it to replay this run. */
    readonly seed: number
    /** Physics-authoritative cube edge length (render must use this, not live store values). */
    readonly cubeScale: number
    /** Physics-authoritative column footprint (X/Z edge) — render must use this, not live store values. */
    readonly columnSize: number
    /** Physics-authoritative column height (Y) — render must use this, not live store values. */
    readonly columnHeight: number
    /** Resolved physics feel (friction + jump). Gravity is applied by the scene at world creation. */
    readonly physics: PhysicsFeel
    /** True when a real heightfield was supplied — enables downhill roll (flat test slabs stay flat). */
    readonly hasTerrain: boolean

    /** Interpolation snapshots (prev = start of last step, curr = end of last step). */
    readonly playerPrev: BodySnapshot = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
    readonly playerCurr: BodySnapshot = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
    readonly enemyPrev: BodySnapshot = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
    readonly enemyCurr: BodySnapshot = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }

    /** Ref-shaped live positions (SonarSystem consumes `{ current: Vector3 }`). */
    readonly playerPosRef = { current: new THREE.Vector3() }
    readonly enemyPosRef = { current: new THREE.Vector3() }
    readonly playerVel = new THREE.Vector3()

    readonly aiState: EnemyAIState = createAIState()
    currentAIState: EnemyState = 'idle'

    /** True once the enemy has tagged the player (cleared by resetPositions). */
    tagged = false

    /** Whether the player is grounded this step (render reads this for speed trails). */
    playerGrounded = false

    /** Enemy start-of-step horizontal velocity + grounded flag (render reads these for enemy trails). */
    readonly enemyVel = new THREE.Vector3()
    enemyGrounded = false

    // Trackers for cosmetic FX edge-detection (don't affect sim physics / determinism).
    private prevGrounded = false
    private prevHorizSpeed = 0
    private prevVy = 0

    /** World-space centers of static obstacles, for the scene to render (never move post-spawn). */
    readonly cubePositions: THREE.Vector3[] = []
    readonly columnPositions: THREE.Vector3[] = []

    /**
     * Per-obstacle orientation aligning the box's local +Y to the terrain normal, so
     * obstacles sit tilted along the ground instead of all facing straight up. Render
     * composes these into the instance matrices (physics-authoritative, anti-drift like
     * cubeScale). Index-aligned with cubePositions / columnPositions. NOTE: the physics
     * colliders stay axis-aligned (the bridge's createStaticBox takes no rotation) — this
     * is a visual tilt; slopes here are gentle so the collider/visual mismatch is minor.
     */
    readonly cubeQuaternions: THREE.Quaternion[] = []
    readonly columnQuaternions: THREE.Quaternion[] = []

    /**
     * Phase P Feature A: scattered dynamic props (dynamic spheres knocked around by play).
     * `propRadii` + `propSpawns` are public for the renderer/tests; the live transforms ride
     * in `propPrev`/`propCurr` (interpolation snapshots, like the player/enemy). All index-aligned.
     */
    readonly propCount: number
    private readonly propBodyPtrs: number[] = []
    readonly propRadii: number[] = []
    readonly propSpawns: { x: number; y: number; z: number }[] = []
    readonly propPrev: BodySnapshot[] = []
    readonly propCurr: BodySnapshot[] = []

    /**
     * Phase P Feature C: crashable crumble blocks (static boxes that burst into debris).
     * `crumblePositions` + `crumbleQuaternions` are the original resting transforms (render
     * reads them); `crumbleAlive[i]` is false once block i has been smashed (render hides it).
     * Physics-authoritative `crumbleScale` (anti-drift like cubeScale). All index-aligned.
     */
    readonly crumbleCount: number
    /** Physics-authoritative crumble-block edge length — render must read this, not the store. */
    readonly crumbleScale: number
    private readonly crumbleBodyPtrs: number[] = []
    readonly crumblePositions: THREE.Vector3[] = []
    readonly crumbleQuaternions: THREE.Quaternion[] = []
    readonly crumbleAlive: boolean[] = []

    /**
     * Live crumble debris (dynamic BOXES, created lazily on smash, retired on reset / cap /
     * fall-off). Feature C "real" path: each debris body's box collider IS its shard visual
     * (`debrisScales` = full dims, half of which are the collider half-extents), so collider and
     * render match exactly. Arrays grow/shrink together; the renderer reads `debrisActiveCount`.
     */
    private readonly debrisBodyPtrs: number[] = []
    readonly debrisPrev: BodySnapshot[] = []
    readonly debrisCurr: BodySnapshot[] = []
    readonly debrisScales: { x: number; y: number; z: number }[] = []
    /** Max debris the renderer should allocate instances for (Feature C perf cap). */
    readonly maxLiveDebris = CRUMBLE.maxLiveDebris
    /** Number of currently-live debris bodies (render fills this many instance slots). */
    get debrisActiveCount(): number { return this.debrisBodyPtrs.length }

    private readonly events: SimEvents
    private readonly playerSpawn: { x: number; y: number; z: number }
    private readonly enemySpawn: { x: number; y: number; z: number }

    // Deterministic sim-time accumulators (replace wall-clock throttles/timeouts).
    private aiClock = 0
    private jumpCooldownLeft = 0

    // Scratch state carried between AI updates.
    private readonly cachedTarget = new THREE.Vector3()
    private readonly avoidanceForce = new THREE.Vector3()

    /** Single seeded randomness stream for the whole sim (scatter + AI jitter). */
    private readonly rand: () => number

    constructor(world: Box3DWorld, config: MarbleSimConfig) {
        this.world = world
        this.enemySize = config.enemySize
        this.seed = config.seed ?? DEFAULT_SIM_SEED
        this.rand = mulberry32(this.seed)
        this.cubeScale = config.obstacles?.cubeScale ?? 0
        this.columnSize = config.obstacles?.columnSize ?? 0
        this.columnHeight = config.obstacles?.columnHeight ?? 0
        this.physics = config.physics ?? PHYSICS_PRESETS[DEFAULT_PHYSICS_PRESET]
        this.hasTerrain = !!config.heights
        this.events = config.events ?? {}
        this.playerSpawn = config.playerSpawn ?? { ...PLAYER.spawn }
        this.enemySpawn = config.enemySpawn ?? { ...ENEMY.spawn }

        // Remove smoke-test bodies left by Box3DWorld.reset() — previously these
        // survived as invisible colliders under the terrain (stray 4x0.5x4 floor
        // at y=-0.5 and a falling r=0.35 sphere at the player spawn column).
        world.clearBodies()

        // --- Environment ---
        if (config.heights) {
            const hfPtr = world.createHeightfield(
                config.heights,
                TERRAIN.width,
                TERRAIN.depth,
                TERRAIN.scale,
                1.0,
                TERRAIN.scale,
                TERRAIN.minHeight,
                TERRAIN.maxHeight,
                this.physics.terrainFriction,
                TERRAIN.restitution
            )
            // Center the heightfield under the visual mesh at origin.
            const hfBodyOffset = -((TERRAIN.width - 1) * TERRAIN.scale) / 2
            world.bodySetTransform(hfPtr, hfBodyOffset, 0, hfBodyOffset, 0, 0, 0, 1)

            const halfWidth = (TERRAIN.width * TERRAIN.scale) / 2
            const halfDepth = (TERRAIN.depth * TERRAIN.scale) / 2
            const wh = TERRAIN.wallHeight
            const th = TERRAIN.wallThickness
            world.createStaticBox(-halfWidth, wh / 2 - 10, 0, th / 2, wh / 2, halfDepth, this.physics.terrainFriction, TERRAIN.restitution)
            world.createStaticBox(halfWidth, wh / 2 - 10, 0, th / 2, wh / 2, halfDepth, this.physics.terrainFriction, TERRAIN.restitution)
            world.createStaticBox(0, wh / 2 - 10, -halfDepth, halfWidth, wh / 2, th / 2, this.physics.terrainFriction, TERRAIN.restitution)
            world.createStaticBox(0, wh / 2 - 10, halfDepth, halfWidth, wh / 2, th / 2, this.physics.terrainFriction, TERRAIN.restitution)
        } else {
            // Flat headless-test slab.
            world.createStaticBox(0, 0, 0, 100, 0.5, 100, this.physics.terrainFriction, TERRAIN.restitution)
        }

        // --- Static obstacles (cubes + columns), scattered outside the spawn-clear radius ---
        const obstacles = config.obstacles
        if (obstacles && obstacles.cubeCount > 0) {
            for (const { x, z } of this.scatterPoints(obstacles.cubeCount)) {
                const half = obstacles.cubeScale / 2
                // Sink into the ground (OBSTACLES.sink) so the base is buried, no floating bottom.
                const y = getTerrainHeight(x, z) + half - OBSTACLES.sink
                world.createStaticBox(x, y, z, half, half, half, OBSTACLES.friction, OBSTACLES.restitution)
                this.cubePositions.push(new THREE.Vector3(x, y, z))
                this.cubeQuaternions.push(MarbleSim.orientToTerrain(x, z))
            }
        }
        if (obstacles && obstacles.columnCount > 0) {
            for (const { x, z } of this.scatterPoints(obstacles.columnCount)) {
                const halfSize = obstacles.columnSize / 2
                const halfHeight = obstacles.columnHeight / 2
                const y = getTerrainHeight(x, z) + halfHeight - OBSTACLES.sink
                world.createStaticBox(x, y, z, halfSize, halfHeight, halfSize, OBSTACLES.friction, OBSTACLES.restitution)
                this.columnPositions.push(new THREE.Vector3(x, y, z))
                this.columnQuaternions.push(MarbleSim.orientToTerrain(x, z))
            }
        }

        // --- Bodies ---
        this.playerBodyPtr = world.createDynamicSphere(
            this.playerSpawn.x, this.playerSpawn.y, this.playerSpawn.z,
            PLAYER.radius, PLAYER.density, this.physics.playerFriction, PLAYER.restitution
        )
        world.setDamping(this.playerBodyPtr, PLAYER.linearDamping, PLAYER.angularDamping)

        this.enemyBodyPtr = world.createDynamicSphere(
            this.enemySpawn.x, this.enemySpawn.y, this.enemySpawn.z,
            config.enemySize, config.enemyMass, ENEMY.friction, ENEMY.restitution
        )
        world.setDamping(this.enemyBodyPtr, ENEMY.linearDamping, ENEMY.angularDamping)

        // --- Scattered dynamic props (Feature A) ---
        // Dynamic spheres are the only dynamic collider the bridge exposes, so props are spheres
        // (a faceted chunk visual rides on top in the scene). Seeded scatter (drawn AFTER cubes +
        // columns from the same stream, so it stays deterministic given seed + counts), varied
        // radius, dropped above the terrain so they settle. Knocked around by the player/enemy for
        // free (they're bodies in the same world). NOTE: the enemy's vision/avoidance raycasts hit
        // these too (the bridge ray has no body filter) — modest count keeps that as "soft cover."
        this.propCount = obstacles?.propCount ?? 0
        if (this.propCount > 0) {
            const pts = this.scatterPoints(this.propCount)
            for (let i = 0; i < this.propCount; i++) {
                const { x, z } = pts[i]
                const radius = PROPS.minRadius + this.rand() * (PROPS.maxRadius - PROPS.minRadius)
                const y = getTerrainHeight(x, z) + radius + PROPS.dropHeight
                const ptr = world.createDynamicSphere(x, y, z, radius, PROPS.density, PROPS.friction, PROPS.restitution)
                world.setDamping(ptr, PROPS.linearDamping, PROPS.angularDamping)
                this.propBodyPtrs.push(ptr)
                this.propRadii.push(radius)
                this.propSpawns.push({ x, y, z })
                this.propPrev.push({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() })
                this.propCurr.push({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() })
            }
        }

        // --- Crashable crumble blocks (Feature C) ---
        // Solid static boxes (like cubes) that burst into debris when crashed through. Scattered
        // LAST from the seeded stream so runs that DON'T set crumbleCount draw nothing new here
        // (byte-identical to before). Blocks track their body ptrs so they can be parked out of the
        // world on smash and moved back on round reset. Debris is created lazily (on smash), not here.
        this.crumbleScale = CRUMBLE.scale
        this.crumbleCount = obstacles?.crumbleCount ?? 0
        if (this.crumbleCount > 0) {
            const half = this.crumbleScale / 2
            for (const { x, z } of this.scatterPoints(this.crumbleCount)) {
                const y = getTerrainHeight(x, z) + half - OBSTACLES.sink
                const ptr = world.createStaticBox(x, y, z, half, half, half, OBSTACLES.friction, OBSTACLES.restitution)
                this.crumbleBodyPtrs.push(ptr)
                this.crumblePositions.push(new THREE.Vector3(x, y, z))
                this.crumbleQuaternions.push(MarbleSim.orientToTerrain(x, z))
                this.crumbleAlive.push(true)
            }
        }

        this.syncSnapshots(true)
    }

    /** Teleport both bodies to spawn, zero velocities, reset AI + tag flag. */
    resetPositions(): void {
        const w = this.world
        w.bodySetTransform(this.playerBodyPtr, this.playerSpawn.x, this.playerSpawn.y, this.playerSpawn.z, 0, 0, 0, 1)
        w.setLinearVelocity(this.playerBodyPtr, 0, 0, 0)
        w.setAngularVelocity(this.playerBodyPtr, 0, 0, 0)

        w.bodySetTransform(this.enemyBodyPtr, this.enemySpawn.x, this.enemySpawn.y, this.enemySpawn.z, 0, 0, 0, 1)
        w.setLinearVelocity(this.enemyBodyPtr, 0, 0, 0)
        w.setAngularVelocity(this.enemyBodyPtr, 0, 0, 0)

        const freshAI = createAIState()
        this.aiState.state = freshAI.state
        this.aiState.stateTimer = 0
        this.aiState.currentWaypointIndex = 0
        this.aiState.lastKnownPlayerPos.set(0, 0, 0)
        if (this.currentAIState !== 'idle') {
            const prev = this.currentAIState
            this.currentAIState = 'idle'
            this.events.onAIStateChange?.(prev, 'idle')
        }

        this.tagged = false
        this.playerGrounded = false
        this.prevGrounded = false
        this.prevHorizSpeed = 0
        this.prevVy = 0
        this.aiClock = 0
        this.jumpCooldownLeft = 0
        this.avoidanceForce.set(0, 0, 0)
        this.cachedTarget.set(0, 0, 0)

        // Return props to their spawn (clears any that got knocked around last round).
        for (let i = 0; i < this.propCount; i++) {
            const s = this.propSpawns[i]
            w.bodySetTransform(this.propBodyPtrs[i], s.x, s.y, s.z, 0, 0, 0, 1)
            w.setLinearVelocity(this.propBodyPtrs[i], 0, 0, 0)
            w.setAngularVelocity(this.propBodyPtrs[i], 0, 0, 0)
        }

        // Feature C: reform any smashed crumble blocks (move the parked static body back to its
        // resting transform, mark alive) and clear all debris from last round.
        for (let i = 0; i < this.crumbleCount; i++) {
            if (!this.crumbleAlive[i]) {
                const p = this.crumblePositions[i]
                w.bodySetTransform(this.crumbleBodyPtrs[i], p.x, p.y, p.z, 0, 0, 0, 1)
                this.crumbleAlive[i] = true
            }
        }
        this.clearDebris()

        this.syncSnapshots(true)
    }

    /** Destroy every live debris body and empty the debris arrays (round reset / teardown). */
    private clearDebris(): void {
        for (const ptr of this.debrisBodyPtrs) this.world.destroyBody(ptr)
        this.debrisBodyPtrs.length = 0
        this.debrisPrev.length = 0
        this.debrisCurr.length = 0
        this.debrisScales.length = 0
    }

    /** Retire the oldest live debris body (called when the live-debris cap is exceeded). */
    private retireOldestDebris(): void {
        const ptr = this.debrisBodyPtrs.shift()
        if (ptr !== undefined) this.world.destroyBody(ptr)
        this.debrisPrev.shift()
        this.debrisCurr.shift()
        this.debrisScales.shift()
    }

    /** True when a sphere (center + radius) overlaps a crumble block's axis-aligned box. */
    private sphereTouchesCrumble(px: number, py: number, pz: number, radius: number, center: THREE.Vector3): boolean {
        const half = this.crumbleScale / 2
        const dx = Math.max(Math.abs(px - center.x) - half, 0)
        const dy = Math.max(Math.abs(py - center.y) - half, 0)
        const dz = Math.max(Math.abs(pz - center.z) - half, 0)
        const reach = radius + CRUMBLE.contactMargin
        return dx * dx + dy * dy + dz * dz <= reach * reach
    }

    /**
     * Smash crumble block `i`: park its static collider out of the world and burst it into a
     * seeded spray of dynamic-sphere debris at the block center. Deterministic — every debris
     * value is drawn from the sim's seeded RNG stream, so a replay reproduces the same collapse.
     */
    private smashBlock(i: number): void {
        const w = this.world
        const c = this.crumblePositions[i]
        // Park the static box far below the arena (out of all play + raycasts). Cheaper + more
        // reversible than destroy/recreate: round reset moves it straight back.
        w.bodySetTransform(this.crumbleBodyPtrs[i], c.x, CRUMBLE.parkY, c.z, 0, 0, 0, 1)
        this.crumbleAlive[i] = false

        const half = this.crumbleScale / 2
        for (let d = 0; d < CRUMBLE.debrisPerBlock; d++) {
            if (this.debrisBodyPtrs.length >= CRUMBLE.maxLiveDebris) this.retireOldestDebris()

            const base = CRUMBLE.minDebrisRadius + this.rand() * (CRUMBLE.maxDebrisRadius - CRUMBLE.minDebrisRadius)
            // Spawn just inside the block volume so pieces don't interpenetrate hard on frame 1.
            const ox = (this.rand() - 0.5) * half
            const oy = (this.rand() - 0.5) * half
            const oz = (this.rand() - 0.5) * half
            const sx = c.x + ox, sy = c.y + oy, sz = c.z + oz

            // Brick shard full dims (seeded). The dynamic-box collider uses these as its
            // half-extents/2 so the COLLIDER IS the visual shard (Feature C "real" path — no more
            // sphere-under-box). base sets the piece scale; the three axes are drawn from WIDE,
            // independent ranges so debris reads as MIXED rubble — some near-cubic bricks, some
            // flat slabs, some long shards — instead of uniform flat cuboids (Grayson: "vary the
            // brick shapes … feels more natural"). Still 3 seeded draws, so determinism holds.
            const shardX = base * (0.7 + this.rand() * 1.7)  // 0.7–2.4
            const shardY = base * (0.5 + this.rand() * 1.3)  // 0.5–1.8
            const shardZ = base * (0.7 + this.rand() * 1.7)  // 0.7–2.4

            const ptr = w.createDynamicBox(sx, sy, sz, shardX / 2, shardY / 2, shardZ / 2, CRUMBLE.density, CRUMBLE.friction, CRUMBLE.restitution)
            w.setDamping(ptr, CRUMBLE.linearDamping, CRUMBLE.angularDamping)

            // Outward burst: radial direction from the block center (falls back to a seeded dir at
            // the exact center) + an upward pop, seeded speed.
            let dirX = ox, dirY = oy, dirZ = oz
            const dlen = Math.hypot(dirX, dirY, dirZ)
            if (dlen > 1e-4) { dirX /= dlen; dirY /= dlen; dirZ /= dlen }
            else { const a = this.rand() * Math.PI * 2; dirX = Math.cos(a); dirY = 0; dirZ = Math.sin(a) }
            const speed = CRUMBLE.burstSpeedMin + this.rand() * (CRUMBLE.burstSpeedMax - CRUMBLE.burstSpeedMin)
            w.setLinearVelocity(ptr, dirX * speed, dirY * speed + CRUMBLE.burstUp, dirZ * speed)

            // Seeded tumble.
            const spin = CRUMBLE.spinMin + this.rand() * (CRUMBLE.spinMax - CRUMBLE.spinMin)
            w.setAngularVelocity(ptr, (this.rand() - 0.5) * 2 * spin, (this.rand() - 0.5) * 2 * spin, (this.rand() - 0.5) * 2 * spin)

            this.debrisBodyPtrs.push(ptr)
            this.debrisScales.push({ x: shardX, y: shardY, z: shardZ })
            this.debrisPrev.push({ position: new THREE.Vector3(sx, sy, sz), quaternion: new THREE.Quaternion() })
            this.debrisCurr.push({ position: new THREE.Vector3(sx, sy, sz), quaternion: new THREE.Quaternion() })
        }
    }

    /**
     * Feature C smash detection: a live crumble block breaks when the player or (un-frozen) enemy
     * is in contact with it while moving faster than CRUMBLE.smashSpeed. Pure over sim-owned
     * position/velocity, so it's deterministic; runs before the physics step so the debris created
     * here is simulated this same tick.
     */
    private detectSmashes(
        px: number, py: number, pz: number, playerSpeed: number,
        ex: number, ey: number, ez: number, enemySpeed: number,
        freezeEnemy: boolean
    ): void {
        const canPlayerSmash = playerSpeed > CRUMBLE.smashSpeed
        const canEnemySmash = !freezeEnemy && enemySpeed > CRUMBLE.smashSpeed
        if (!canPlayerSmash && !canEnemySmash) return
        for (let i = 0; i < this.crumbleCount; i++) {
            if (!this.crumbleAlive[i]) continue
            const c = this.crumblePositions[i]
            if (canPlayerSmash && this.sphereTouchesCrumble(px, py, pz, PLAYER.radius, c)) { this.smashBlock(i); continue }
            if (canEnemySmash && this.sphereTouchesCrumble(ex, ey, ez, this.enemySize, c)) this.smashBlock(i)
        }
    }

    /**
     * Velocity-driven control (Known issue #4 fix): input drives horizontal
     * velocity DIRECTLY toward a target (accelerate with authority, cap at top
     * speed), and the ball's spin is slaved to its motion so it rolls 1:1 with
     * no wheel-spin. Rolling-without-slip about the up normal gives
     * ω = (v_z / r, 0, -v_x / r). Vertical velocity (gravity/jump) is left to
     * physics; airborne hands back to physics apart from a light steering nudge.
     * Input mapping: forward = -Z, right = +X.
     */
    private applyVelocityControl(
        w: Box3DWorld,
        input: SimInput,
        isGrounded: boolean,
        playerVel: Vec3Like,
        dt: number,
        params: SimParams,
        posX: number,
        posZ: number
    ): void {
        let dirX = (input.d ? 1 : 0) - (input.a ? 1 : 0)
        let dirZ = (input.s ? 1 : 0) - (input.w ? 1 : 0)
        const hasInput = dirX !== 0 || dirZ !== 0
        if (hasInput) {
            const len = Math.hypot(dirX, dirZ)
            dirX /= len
            dirZ /= len
        }

        // Live-tunable movement knobs (fall back to the tuning.ts constants when omitted).
        const topSpeed = params.moveTopSpeed ?? MOVEMENT.topSpeed
        const accel = params.moveAccel ?? MOVEMENT.accel
        const brakeDecel = params.moveBrakeDecel ?? MOVEMENT.brakeDecel
        const airCtl = params.moveAirControl ?? MOVEMENT.airControl

        if (!isGrounded) {
            // Airborne: physics owns motion; allow only a light steering nudge.
            if (hasInput) {
                const nudge = accel * airCtl * dt
                w.setLinearVelocity(this.playerBodyPtr, playerVel.x + dirX * nudge, playerVel.y, playerVel.z + dirZ * nudge)
            }
            return
        }

        const braking = input.shift
        let vx = playerVel.x
        let vz = playerVel.z

        if (!hasInput && !braking) {
            // --- Coast: inertia glide + gravity-driven downhill roll (the "drift" feel) ---
            // Ball lets go → keeps its momentum, bleeds off slowly, and rolls downhill on
            // slopes. downhillRoll = fraction of true g·sinθ. The slope comes from the
            // ANALYTIC terrain gradient (getTerrainHeight — same source obstacle placement
            // trusts), because the WASM heightfield raycast returns a flat up-normal.
            // Only on real terrain — flat test slabs (no heightfield) stay deterministic.
            const downhillRoll = params.downhillRoll ?? DEFAULT_DOWNHILL_ROLL
            if (downhillRoll > 0 && this.hasTerrain) {
                const eps = 0.75
                const dhdx = (getTerrainHeight(posX + eps, posZ) - getTerrainHeight(posX - eps, posZ)) / (2 * eps)
                const dhdz = (getTerrainHeight(posX, posZ + eps) - getTerrainHeight(posX, posZ - eps)) / (2 * eps)
                const slope = Math.hypot(dhdx, dhdz)       // rise/run = tan(θ)
                if (slope > 1e-4) {
                    const tilt = slope / Math.sqrt(1 + slope * slope) // sin(θ)
                    const aDown = Math.abs(this.physics.gravityY) * tilt * downhillRoll
                    // Downhill direction = −gradient (toward decreasing height), unit-scaled.
                    vx += (-dhdx / slope) * aDown * dt
                    vz += (-dhdz / slope) * aDown * dt
                    const ds = Math.hypot(vx, vz)
                    if (ds > MOVEMENT.downhillMaxSpeed) {
                        const s = MOVEMENT.downhillMaxSpeed / ds
                        vx *= s
                        vz *= s
                    }
                }
            }
            // Coast decay: exponential drag (inertia glide) + small constant floor (settles
            // to rest on flat + sets the slope threshold that actually rolls). playerDrift
            // sets how long the glide lasts. Applied AFTER the downhill add so a terminal
            // downhill speed emerges instead of the decel simply cancelling the roll.
            const drift = params.playerDrift ?? DEFAULT_DRIFT
            const k = MOVEMENT.coastDragMax + (MOVEMENT.coastDragMin - MOVEMENT.coastDragMax) * drift
            const sp = Math.hypot(vx, vz)
            if (sp > 1e-6) {
                const ns = Math.max(0, sp * Math.exp(-k * dt) - MOVEMENT.coastFloor * dt)
                const s = ns / sp
                vx *= s
                vz *= s
            }
        } else {
            // --- Driving or braking: approach the target velocity with authority ---
            const targetVx = (!braking && hasInput) ? dirX * topSpeed : 0
            const targetVz = (!braking && hasInput) ? dirZ * topSpeed : 0
            const rate = braking ? brakeDecel : accel
            const maxDelta = rate * dt
            const dvx = targetVx - vx
            const dvz = targetVz - vz
            const dmag = Math.hypot(dvx, dvz)
            if (dmag <= maxDelta || dmag < 1e-6) {
                vx = targetVx
                vz = targetVz
            } else {
                const s = maxDelta / dmag
                vx += dvx * s
                vz += dvz * s
            }
        }

        w.setLinearVelocity(this.playerBodyPtr, vx, playerVel.y, vz)

        // Slave spin to motion so the texture rolls without slipping (no wheel-spin).
        const r = PLAYER.radius
        w.setAngularVelocity(this.playerBodyPtr, vz / r, 0, -vx / r)
    }

    /**
     * Un-embed safety net — see systems/sim/unstick.ts. Returns an ejection velocity if the
     * ball center is inside a static obstacle collider AABB, else null.
     */
    private ejectFromObstacle(px: number, py: number, pz: number): { x: number; y: number; z: number } | null {
        return computeEjection(
            px, py, pz,
            this.cubePositions, this.cubeScale,
            this.columnPositions, this.columnSize, this.columnHeight,
            { ejectSpeed: EJECT_SPEED, ejectUp: EJECT_UP },
        )
    }

    /**
     * Velocity-driven enemy control (mirrors the player, per Grayson's "same idea").
     * Drives the enemy's horizontal velocity toward its AI heading at a state-scaled
     * top speed (chase fastest), with avoidance rotating the heading, and slaves spin
     * to motion. Airborne hands back to physics (optional light nudge).
     */
    private applyEnemyVelocityControl(
        w: Box3DWorld,
        headingX: number,
        headingZ: number,
        isGrounded: boolean,
        enemyVel: Vec3Like,
        params: SimParams,
        dt: number
    ): void {
        const velUnit = params.enemyVelUnit ?? ENEMY.velUnit
        const velAccel = params.enemyVelAccel ?? ENEMY.velAccel
        const targetSpeed = params.enemySpeed * getSpeedMultiplier(this.currentAIState) * velUnit

        let dx = headingX + this.avoidanceForce.x
        let dz = headingZ + this.avoidanceForce.z
        const len = Math.hypot(dx, dz)
        if (len > 1e-6) { dx /= len; dz /= len } else { dx = 0; dz = 0 }

        if (!isGrounded) {
            if (params.enemyAirControl > 0 && targetSpeed > 0) {
                const nudge = velAccel * params.enemyAirControl * dt
                w.setLinearVelocity(this.enemyBodyPtr, enemyVel.x + dx * nudge, enemyVel.y, enemyVel.z + dz * nudge)
            }
            return
        }

        const targetVx = dx * targetSpeed
        const targetVz = dz * targetSpeed
        const maxDelta = velAccel * dt
        let vx = enemyVel.x
        let vz = enemyVel.z
        const dvx = targetVx - vx
        const dvz = targetVz - vz
        const dmag = Math.hypot(dvx, dvz)
        if (dmag <= maxDelta || dmag < 1e-6) {
            vx = targetVx
            vz = targetVz
        } else {
            const s = maxDelta / dmag
            vx += dvx * s
            vz += dvz * s
        }
        w.setLinearVelocity(this.enemyBodyPtr, vx, enemyVel.y, vz)

        const r = this.enemySize
        w.setAngularVelocity(this.enemyBodyPtr, vz / r, 0, -vx / r)
    }

    /**
     * Advance the simulation exactly one fixed step.
     * `dt` MUST be the loop's fixed step size — pass anything else and
     * determinism (F8) is gone.
     */
    step(dt: number, input: SimInput = NO_INPUT, params: SimParams = { enemySpeed: 1, enemyAirControl: 0.2 }): void {
        const w = this.world

        // Snapshot rotation: current becomes previous.
        this.playerPrev.position.copy(this.playerCurr.position)
        this.playerPrev.quaternion.copy(this.playerCurr.quaternion)
        this.enemyPrev.position.copy(this.enemyCurr.position)
        this.enemyPrev.quaternion.copy(this.enemyCurr.quaternion)
        for (let i = 0; i < this.propCount; i++) {
            this.propPrev[i].position.copy(this.propCurr[i].position)
            this.propPrev[i].quaternion.copy(this.propCurr[i].quaternion)
        }
        for (let i = 0; i < this.debrisBodyPtrs.length; i++) {
            this.debrisPrev[i].position.copy(this.debrisCurr[i].position)
            this.debrisPrev[i].quaternion.copy(this.debrisCurr[i].quaternion)
        }

        // --- Read state (end of previous step) ---
        const playerTrans = w.readBodyTransform(this.playerBodyPtr)
        const playerVel = w.getLinearVelocity(this.playerBodyPtr)
        const enemyTrans = w.readBodyTransform(this.enemyBodyPtr)
        const enemyVel = w.getLinearVelocity(this.enemyBodyPtr)

        this.playerPosRef.current.set(playerTrans.position.x, playerTrans.position.y, playerTrans.position.z)
        this.enemyPosRef.current.set(enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z)
        this.playerVel.set(playerVel.x, playerVel.y, playerVel.z)
        this.enemyVel.set(enemyVel.x, enemyVel.y, enemyVel.z)

        // --- Player input ---
        const groundHit = w.raycastClosest(
            playerTrans.position.x, playerTrans.position.y, playerTrans.position.z,
            0, -PLAYER.groundProbe, 0
        )
        const isGrounded = groundHit.hit

        // --- Cosmetic FX edge-detection (render-only listeners; never mutates sim state) ---
        // Uses the physics-resolved start-of-step velocity, so a wall/cube collision from
        // the previous step shows up as a sharp horizontal-speed drop this step.
        const horizSpeed = Math.hypot(playerVel.x, playerVel.z)
        if (this.prevHorizSpeed - horizSpeed > FX.impactSpeedDrop) {
            this.events.onImpact?.(playerTrans.position.x, playerTrans.position.y, playerTrans.position.z, this.prevHorizSpeed - horizSpeed)
        }
        if (!this.prevGrounded && isGrounded && this.prevVy < -FX.landSpeed) {
            this.events.onLand?.(playerTrans.position.x, playerTrans.position.y, playerTrans.position.z, -this.prevVy)
        }
        this.playerGrounded = isGrounded

        // Un-embed safety net: if the ball has ended up INSIDE a static obstacle collider
        // (tunneled in at speed, or clipped a cube while landing), the velocity model below
        // would clobber the physics solver's push-out every step and trap it ("stuck inside a
        // cube, can't move"). Detect deep penetration and eject out the nearest face instead.
        // Normal play never triggers this — the ball center is never inside a collider — so
        // feel is untouched, and it's pure math on sim-owned positions (determinism intact).
        const eject = this.ejectFromObstacle(playerTrans.position.x, playerTrans.position.y, playerTrans.position.z)
        if (eject) {
            w.setLinearVelocity(this.playerBodyPtr, eject.x, eject.y, eject.z)
        } else {
            this.applyVelocityControl(w, input, isGrounded, playerVel, dt, params, playerTrans.position.x, playerTrans.position.z)
        }

        // Jump (sim-time cooldown; was wall-clock setTimeout).
        // Set vertical velocity directly from a target apex HEIGHT: v = sqrt(2·|g|·h).
        // Mass-free and exact, so jump height holds across gravity presets. Nerfed default
        // clears the enemy ball (~1.8u) but never summits the tall cubes.
        if (this.jumpCooldownLeft > 0) this.jumpCooldownLeft -= dt
        if (input.space && isGrounded && this.jumpCooldownLeft <= 0) {
            const h = params.jumpHeight ?? PLAYER.jumpHeight
            const jumpVel = Math.sqrt(2 * Math.abs(this.physics.gravityY) * h)
            const v = w.getLinearVelocity(this.playerBodyPtr)
            w.setLinearVelocity(this.playerBodyPtr, v.x, jumpVel, v.z)
            this.jumpCooldownLeft = PLAYER.jumpCooldown
        }

        // --- Enemy AI + movement, OR pinned at spawn during countdown early-release ---
        const freezeEnemy = params.freezeEnemy === true

        // --- Enemy AI decisions (deterministic 10Hz sim-time throttle) ---
        this.aiClock += dt
        if (!freezeEnemy && this.aiClock >= ENEMY.aiUpdateInterval) {
            this.aiClock -= ENEMY.aiUpdateInterval

            const dx = playerTrans.position.x - enemyTrans.position.x
            const dy = playerTrans.position.y - enemyTrans.position.y
            const dz = playerTrans.position.z - enemyTrans.position.z
            const distToPlayer = Math.sqrt(dx * dx + dy * dy + dz * dz)

            // Line of sight via native raycast, filtering out the player body itself.
            let canSee = false
            if (distToPlayer < ENEMY.visionDistance) {
                const visionHit = w.raycastClosest(
                    enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z,
                    dx, dy, dz
                )
                const expectedFraction = (distToPlayer - PLAYER.radius - 0.05) / distToPlayer
                canSee = !visionHit.hit || visionHit.fraction >= expectedFraction
            }

            const prevState = this.aiState.state
            const newState = updateAIState(this.aiState, canSee, this.playerPosRef.current, ENEMY.aiUpdateInterval, this.playerVel, this.rand)
            if (newState !== this.currentAIState) {
                this.currentAIState = newState
                this.events.onAIStateChange?.(prevState, newState)
            }

            getMovementTarget(this.aiState, this.enemyPosRef.current, this.playerPosRef.current, this.playerVel, this.cachedTarget)

            // Obstacle avoidance probe along travel direction.
            const toTargetX = this.cachedTarget.x - enemyTrans.position.x
            const toTargetZ = this.cachedTarget.z - enemyTrans.position.z
            const toTargetLen = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ)
            const desiredX = toTargetLen > 0.01 ? toTargetX / toTargetLen : 0
            const desiredZ = toTargetLen > 0.01 ? toTargetZ / toTargetLen : 0

            const enemyVelLen = Math.sqrt(enemyVel.x * enemyVel.x + enemyVel.z * enemyVel.z)
            const velDirX = enemyVelLen > 0.01 ? enemyVel.x / enemyVelLen : desiredX
            const velDirZ = enemyVelLen > 0.01 ? enemyVel.z / enemyVelLen : desiredZ
            const checkDirX = enemyVelLen > 1 ? velDirX : desiredX
            const checkDirZ = enemyVelLen > 1 ? velDirZ : desiredZ

            const rayLen = this.enemySize + ENEMY.avoidProbeExtra
            const avoidHit = w.raycastClosest(
                enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z,
                checkDirX * rayLen, 0, checkDirZ * rayLen
            )

            this.avoidanceForce.set(0, 0, 0)
            if (avoidHit.hit) {
                const cosA = Math.cos(ENEMY.avoidAngle)
                const sinA = Math.sin(ENEMY.avoidAngle)
                const rotX = checkDirX * cosA - checkDirZ * sinA
                const rotZ = checkDirX * sinA + checkDirZ * cosA
                this.avoidanceForce.set(rotX * ENEMY.avoidStrength, 0, rotZ * ENEMY.avoidStrength)
            }
        }

        // --- Enemy movement application (every step) ---
        const enemyGroundHit = w.raycastClosest(
            enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z,
            0, -(this.enemySize + ENEMY.groundProbeExtra), 0
        )
        const isEnemyGrounded = enemyGroundHit.hit
            && enemyGroundHit.fraction <= ((this.enemySize + ENEMY.groundedFractionSlack) / (this.enemySize + ENEMY.groundProbeExtra))

        let moveX = playerTrans.position.x - enemyTrans.position.x
        let moveZ = playerTrans.position.z - enemyTrans.position.z
        if (this.currentAIState !== 'chase' && this.currentAIState !== 'alert') {
            moveX = this.cachedTarget.x - enemyTrans.position.x
            moveZ = this.cachedTarget.z - enemyTrans.position.z
        }
        const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ)
        const headingX = moveLen > 0.01 ? moveX / moveLen : 0
        const headingZ = moveLen > 0.01 ? moveZ / moveLen : 0

        this.enemyGrounded = freezeEnemy ? false : isEnemyGrounded

        if (freezeEnemy) {
            // Countdown early-release: lock the enemy at spawn (no chase yet) so the
            // player can take a head start. Overrides any residual velocity so it
            // stays put right up until the countdown timer ends and normal play begins.
            w.bodySetTransform(this.enemyBodyPtr, this.enemySpawn.x, this.enemySpawn.y, this.enemySpawn.z, 0, 0, 0, 1)
            w.setLinearVelocity(this.enemyBodyPtr, 0, 0, 0)
            w.setAngularVelocity(this.enemyBodyPtr, 0, 0, 0)
            this.enemyVel.set(0, 0, 0)
        } else {
            this.applyEnemyVelocityControl(w, headingX, headingZ, isEnemyGrounded, enemyVel, params, dt)
        }

        // --- Tag detection (edge-triggered; skipped while the enemy is frozen) ---
        const distToPlayer = this.enemyPosRef.current.distanceTo(this.playerPosRef.current)
        if (!freezeEnemy && !this.tagged && distToPlayer < (this.enemySize + PLAYER.radius + RULES.tagSlack)) {
            this.tagged = true
            this.events.onTag?.()
        }

        // --- Fall-off-world resets ---
        const playerReset = playerTrans.position.y < RULES.fallResetY
        if (playerReset) {
            w.bodySetTransform(this.playerBodyPtr, this.playerSpawn.x, this.playerSpawn.y, this.playerSpawn.z, 0, 0, 0, 1)
            w.setLinearVelocity(this.playerBodyPtr, 0, 0, 0)
            w.setAngularVelocity(this.playerBodyPtr, 0, 0, 0)
        }
        if (enemyTrans.position.y < RULES.fallResetY) {
            w.bodySetTransform(this.enemyBodyPtr, this.enemySpawn.x, this.enemySpawn.y, this.enemySpawn.z, 0, 0, 0, 1)
            w.setLinearVelocity(this.enemyBodyPtr, 0, 0, 0)
            w.setAngularVelocity(this.enemyBodyPtr, 0, 0, 0)
        }
        // Props: respawn any that get knocked off the world so the clutter persists.
        for (let i = 0; i < this.propCount; i++) {
            const pt = w.readBodyTransform(this.propBodyPtrs[i])
            if (pt.position.y < RULES.fallResetY) {
                const s = this.propSpawns[i]
                w.bodySetTransform(this.propBodyPtrs[i], s.x, s.y, s.z, 0, 0, 0, 1)
                w.setLinearVelocity(this.propBodyPtrs[i], 0, 0, 0)
                w.setAngularVelocity(this.propBodyPtrs[i], 0, 0, 0)
            }
        }
        // Crumble debris: retire (destroy) any that fall off the world — debris is disposable, not
        // respawned. Backward walk so splices don't skip indices.
        for (let i = this.debrisBodyPtrs.length - 1; i >= 0; i--) {
            const dt2 = w.readBodyTransform(this.debrisBodyPtrs[i])
            if (dt2.position.y < RULES.fallResetY) {
                w.destroyBody(this.debrisBodyPtrs[i])
                this.debrisBodyPtrs.splice(i, 1)
                this.debrisPrev.splice(i, 1)
                this.debrisCurr.splice(i, 1)
                this.debrisScales.splice(i, 1)
            }
        }

        // Feature C: detect fast crashes into crumble blocks and burst them into debris. Runs just
        // before the physics step so new debris is simulated this tick. Deterministic (sim state).
        if (this.crumbleCount > 0) {
            const playerSpeed = Math.hypot(playerVel.x, playerVel.y, playerVel.z)
            const enemySpeed = Math.hypot(enemyVel.x, enemyVel.y, enemyVel.z)
            this.detectSmashes(
                playerTrans.position.x, playerTrans.position.y, playerTrans.position.z, playerSpeed,
                enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z, enemySpeed,
                freezeEnemy
            )
        }

        // Update FX edge-detection trackers (guard against fall-reset false positives).
        this.prevGrounded = playerReset ? false : isGrounded
        this.prevHorizSpeed = playerReset ? 0 : horizSpeed
        this.prevVy = playerReset ? 0 : playerVel.y

        // --- Physics step (fixed dt) ---
        w.step(dt)

        this.syncSnapshots(false)
    }

    /**
     * Quaternion that tilts a box's local +Y onto the terrain normal at (x, z), so
     * scattered obstacles sit flush along the slope instead of poking straight up.
     * Pure + deterministic (analytic normal), so it needs no world/RNG state.
     */
    private static orientToTerrain(x: number, z: number): THREE.Quaternion {
        const n = getTerrainNormal(x, z)
        return new THREE.Quaternion().setFromUnitVectors(
            WORLD_UP,
            new THREE.Vector3(n.x, n.y, n.z)
        )
    }

    /** Random (x, z) points kept outside OBSTACLES.clearRadius of the arena center. */
    private scatterPoints(count: number): { x: number; z: number }[] {
        const points: { x: number; z: number }[] = []
        const rangeX = TERRAIN.width * TERRAIN.scale * OBSTACLES.spawnAreaFactor
        const rangeZ = TERRAIN.depth * TERRAIN.scale * OBSTACLES.spawnAreaFactor
        for (let i = 0; i < count; i++) {
            let x: number, z: number
            do {
                x = (this.rand() - 0.5) * rangeX
                z = (this.rand() - 0.5) * rangeZ
            } while (x * x + z * z < OBSTACLES.clearRadius * OBSTACLES.clearRadius)
            points.push({ x, z })
        }
        return points
    }

    /** Refresh curr snapshots from the world (and prev too when hard = true). */
    private syncSnapshots(hard: boolean): void {
        const pt = this.world.readBodyTransform(this.playerBodyPtr)
        this.playerCurr.position.set(pt.position.x, pt.position.y, pt.position.z)
        this.playerCurr.quaternion.set(pt.rotation.x, pt.rotation.y, pt.rotation.z, pt.rotation.w)

        const et = this.world.readBodyTransform(this.enemyBodyPtr)
        this.enemyCurr.position.set(et.position.x, et.position.y, et.position.z)
        this.enemyCurr.quaternion.set(et.rotation.x, et.rotation.y, et.rotation.z, et.rotation.w)

        for (let i = 0; i < this.propCount; i++) {
            const t = this.world.readBodyTransform(this.propBodyPtrs[i])
            this.propCurr[i].position.set(t.position.x, t.position.y, t.position.z)
            this.propCurr[i].quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w)
            if (hard) {
                this.propPrev[i].position.copy(this.propCurr[i].position)
                this.propPrev[i].quaternion.copy(this.propCurr[i].quaternion)
            }
        }

        for (let i = 0; i < this.debrisBodyPtrs.length; i++) {
            const t = this.world.readBodyTransform(this.debrisBodyPtrs[i])
            this.debrisCurr[i].position.set(t.position.x, t.position.y, t.position.z)
            this.debrisCurr[i].quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w)
            if (hard) {
                this.debrisPrev[i].position.copy(this.debrisCurr[i].position)
                this.debrisPrev[i].quaternion.copy(this.debrisCurr[i].quaternion)
            }
        }

        if (hard) {
            this.playerPrev.position.copy(this.playerCurr.position)
            this.playerPrev.quaternion.copy(this.playerCurr.quaternion)
            this.enemyPrev.position.copy(this.enemyCurr.position)
            this.enemyPrev.quaternion.copy(this.enemyCurr.quaternion)
            this.playerPosRef.current.copy(this.playerCurr.position)
            this.enemyPosRef.current.copy(this.enemyCurr.position)
        }
    }
}
