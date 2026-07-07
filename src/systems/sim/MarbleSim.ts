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
 * - Deterministic given identical inputs while the AI stays out of `search`
 *   (search waypoint generation is the one remaining Math.random() source).
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
import { TERRAIN, PLAYER, ENEMY, RULES } from './tuning'

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
}

export interface SimEvents {
    /** Fired once when the enemy first tags the player (edge-triggered). */
    onTag?: () => void
    /** Fired on AI state transitions (for sounds + HUD). */
    onAIStateChange?: (prev: EnemyState, next: EnemyState) => void
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
}

const NO_INPUT: SimInput = { w: false, a: false, s: false, d: false, space: false, shift: false }

export class MarbleSim {
    readonly world: Box3DWorld
    readonly playerBodyPtr: number
    readonly enemyBodyPtr: number
    readonly enemySize: number

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

    private readonly events: SimEvents
    private readonly playerSpawn: { x: number; y: number; z: number }
    private readonly enemySpawn: { x: number; y: number; z: number }

    // Deterministic sim-time accumulators (replace wall-clock throttles/timeouts).
    private aiClock = 0
    private jumpCooldownLeft = 0

    // Scratch state carried between AI updates.
    private readonly cachedTarget = new THREE.Vector3()
    private readonly avoidanceForce = new THREE.Vector3()

    constructor(world: Box3DWorld, config: MarbleSimConfig) {
        this.world = world
        this.enemySize = config.enemySize
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
                TERRAIN.friction,
                TERRAIN.restitution
            )
            // Center the heightfield under the visual mesh at origin.
            const hfBodyOffset = -((TERRAIN.width - 1) * TERRAIN.scale) / 2
            world.bodySetTransform(hfPtr, hfBodyOffset, 0, hfBodyOffset, 0, 0, 0, 1)

            const halfWidth = (TERRAIN.width * TERRAIN.scale) / 2
            const halfDepth = (TERRAIN.depth * TERRAIN.scale) / 2
            const wh = TERRAIN.wallHeight
            const th = TERRAIN.wallThickness
            world.createStaticBox(-halfWidth, wh / 2 - 10, 0, th / 2, wh / 2, halfDepth, TERRAIN.friction, TERRAIN.restitution)
            world.createStaticBox(halfWidth, wh / 2 - 10, 0, th / 2, wh / 2, halfDepth, TERRAIN.friction, TERRAIN.restitution)
            world.createStaticBox(0, wh / 2 - 10, -halfDepth, halfWidth, wh / 2, th / 2, TERRAIN.friction, TERRAIN.restitution)
            world.createStaticBox(0, wh / 2 - 10, halfDepth, halfWidth, wh / 2, th / 2, TERRAIN.friction, TERRAIN.restitution)
        } else {
            // Flat headless-test slab.
            world.createStaticBox(0, 0, 0, 100, 0.5, 100, TERRAIN.friction, TERRAIN.restitution)
        }

        // --- Bodies ---
        this.playerBodyPtr = world.createDynamicSphere(
            this.playerSpawn.x, this.playerSpawn.y, this.playerSpawn.z,
            PLAYER.radius, PLAYER.density, PLAYER.friction, PLAYER.restitution
        )
        world.setDamping(this.playerBodyPtr, PLAYER.linearDamping, PLAYER.angularDamping)

        this.enemyBodyPtr = world.createDynamicSphere(
            this.enemySpawn.x, this.enemySpawn.y, this.enemySpawn.z,
            config.enemySize, config.enemyMass, ENEMY.friction, ENEMY.restitution
        )
        world.setDamping(this.enemyBodyPtr, ENEMY.linearDamping, ENEMY.angularDamping)

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
        this.aiClock = 0
        this.jumpCooldownLeft = 0
        this.avoidanceForce.set(0, 0, 0)
        this.cachedTarget.set(0, 0, 0)

        this.syncSnapshots(true)
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

        // --- Read state (end of previous step) ---
        const playerTrans = w.readBodyTransform(this.playerBodyPtr)
        const playerVel = w.getLinearVelocity(this.playerBodyPtr)
        const enemyTrans = w.readBodyTransform(this.enemyBodyPtr)
        const enemyVel = w.getLinearVelocity(this.enemyBodyPtr)

        this.playerPosRef.current.set(playerTrans.position.x, playerTrans.position.y, playerTrans.position.z)
        this.enemyPosRef.current.set(enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z)
        this.playerVel.set(playerVel.x, playerVel.y, playerVel.z)

        // --- Player input ---
        const groundHit = w.raycastClosest(
            playerTrans.position.x, playerTrans.position.y, playerTrans.position.z,
            0, -PLAYER.groundProbe, 0
        )
        const isGrounded = groundHit.hit

        let tx = (input.w ? -PLAYER.torque : 0) + (input.s ? PLAYER.torque : 0)
        let tz = (input.a ? PLAYER.torque : 0) + (input.d ? -PLAYER.torque : 0)
        if (!isGrounded) {
            tx *= PLAYER.airControl
            tz *= PLAYER.airControl
        }

        const playerAngVel = w.getAngularVelocity(this.playerBodyPtr)
        if (tx !== 0 && playerAngVel.x !== 0 && Math.sign(tx) !== Math.sign(playerAngVel.x)) {
            tx *= PLAYER.directionChangeBoost
        }
        if (tz !== 0 && playerAngVel.z !== 0 && Math.sign(tz) !== Math.sign(playerAngVel.z)) {
            tz *= PLAYER.directionChangeBoost
        }
        w.applyTorque(this.playerBodyPtr, tx, 0, tz)

        if (isGrounded) {
            if (input.shift) {
                w.applyTorque(this.playerBodyPtr, -playerAngVel.x * PLAYER.brakeTorqueFactor, 0, -playerAngVel.z * PLAYER.brakeTorqueFactor)
                if (Math.sqrt(playerVel.x * playerVel.x + playerVel.z * playerVel.z) > 0.1) {
                    w.applyLinearImpulseToCenter(this.playerBodyPtr, -playerVel.x * PLAYER.brakeImpulseFactor, 0, -playerVel.z * PLAYER.brakeImpulseFactor)
                }
            } else if (tx === 0 && tz === 0) {
                w.applyTorque(this.playerBodyPtr, -playerAngVel.x * PLAYER.idleSpinDamping, 0, -playerAngVel.z * PLAYER.idleSpinDamping)
            }
        }

        // Soft top-speed cap.
        const currentSpeed = Math.sqrt(playerVel.x * playerVel.x + playerVel.z * playerVel.z)
        if (currentSpeed > PLAYER.topSpeed) {
            const excess = currentSpeed - PLAYER.topSpeed
            const nextSpeed = PLAYER.topSpeed + excess * Math.exp(-PLAYER.topSpeedDecayRate * dt)
            const decay = nextSpeed / currentSpeed
            w.setLinearVelocity(this.playerBodyPtr, playerVel.x * decay, playerVel.y, playerVel.z * decay)
        }

        // Jump (sim-time cooldown; was wall-clock setTimeout).
        if (this.jumpCooldownLeft > 0) this.jumpCooldownLeft -= dt
        if (input.space && isGrounded && this.jumpCooldownLeft <= 0) {
            w.applyLinearImpulseToCenter(this.playerBodyPtr, 0, PLAYER.jumpImpulse, 0)
            this.jumpCooldownLeft = PLAYER.jumpCooldown
        }

        // --- Enemy AI decisions (deterministic 10Hz sim-time throttle) ---
        this.aiClock += dt
        if (this.aiClock >= ENEMY.aiUpdateInterval) {
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
            const newState = updateAIState(this.aiState, canSee, this.playerPosRef.current, ENEMY.aiUpdateInterval, this.playerVel)
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
        const enemyControl = isEnemyGrounded ? 1.0 : params.enemyAirControl

        let moveX = playerTrans.position.x - enemyTrans.position.x
        let moveZ = playerTrans.position.z - enemyTrans.position.z
        if (this.currentAIState !== 'chase' && this.currentAIState !== 'alert') {
            moveX = this.cachedTarget.x - enemyTrans.position.x
            moveZ = this.cachedTarget.z - enemyTrans.position.z
        }
        const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ)
        const headingX = moveLen > 0.01 ? moveX / moveLen : 0
        const headingZ = moveLen > 0.01 ? moveZ / moveLen : 0

        let fx = headingX + this.avoidanceForce.x
        let fz = headingZ + this.avoidanceForce.z

        const enemyVelLen = Math.sqrt(enemyVel.x * enemyVel.x + enemyVel.z * enemyVel.z)
        if (enemyVelLen > ENEMY.minSpeedForBraking) {
            const velDirX = enemyVel.x / enemyVelLen
            const velDirZ = enemyVel.z / enemyVelLen
            const alignment = velDirX * headingX + velDirZ * headingZ
            if (alignment < ENEMY.brakeAlignmentThreshold) {
                const brakingStrength = (1 - alignment) * enemyVelLen * ENEMY.brakeStrengthFactor
                fx -= velDirX * brakingStrength
                fz -= velDirZ * brakingStrength
            }
        }

        const forceStrength = params.enemySpeed * getSpeedMultiplier(this.currentAIState) * ENEMY.forceFactor * enemyControl
        w.applyForceToCenter(this.enemyBodyPtr, fx * forceStrength, 0, fz * forceStrength)

        // --- Tag detection (edge-triggered) ---
        const distToPlayer = this.enemyPosRef.current.distanceTo(this.playerPosRef.current)
        if (!this.tagged && distToPlayer < (this.enemySize + PLAYER.radius + RULES.tagSlack)) {
            this.tagged = true
            this.events.onTag?.()
        }

        // --- Fall-off-world resets ---
        if (playerTrans.position.y < RULES.fallResetY) {
            w.bodySetTransform(this.playerBodyPtr, this.playerSpawn.x, this.playerSpawn.y, this.playerSpawn.z, 0, 0, 0, 1)
            w.setLinearVelocity(this.playerBodyPtr, 0, 0, 0)
            w.setAngularVelocity(this.playerBodyPtr, 0, 0, 0)
        }
        if (enemyTrans.position.y < RULES.fallResetY) {
            w.bodySetTransform(this.enemyBodyPtr, this.enemySpawn.x, this.enemySpawn.y, this.enemySpawn.z, 0, 0, 0, 1)
            w.setLinearVelocity(this.enemyBodyPtr, 0, 0, 0)
            w.setAngularVelocity(this.enemyBodyPtr, 0, 0, 0)
        }

        // --- Physics step (fixed dt) ---
        w.step(dt)

        this.syncSnapshots(false)
    }

    /** Refresh curr snapshots from the world (and prev too when hard = true). */
    private syncSnapshots(hard: boolean): void {
        const pt = this.world.readBodyTransform(this.playerBodyPtr)
        this.playerCurr.position.set(pt.position.x, pt.position.y, pt.position.z)
        this.playerCurr.quaternion.set(pt.rotation.x, pt.rotation.y, pt.rotation.z, pt.rotation.w)

        const et = this.world.readBodyTransform(this.enemyBodyPtr)
        this.enemyCurr.position.set(et.position.x, et.position.y, et.position.z)
        this.enemyCurr.quaternion.set(et.rotation.x, et.rotation.y, et.rotation.z, et.rotation.w)

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
