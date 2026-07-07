import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import fs from 'fs'
import path from 'path'
import { Box3DWorld } from './Box3DWorld'
import { loadBox3DBridge, loadBox3DBridgeModule } from './box3dBridge'
import { useGameStore } from '../../store/useGameStore'
import { createAIState, updateAIState, getMovementTarget } from '../../systems/ai/EnemyAI'
import createMarbleBox3DBridgeModule from '../../../public/box3d/box3d_bridge.js'

// Setup Node-compatible environment for Emscripten WASM loading
const wasmPath = path.resolve(process.cwd(), 'public/box3d/box3d_bridge.wasm')
const wasmBuffer = fs.readFileSync(wasmPath)

const manifest = {
    version: '0.1.0',
    moduleUrl: '/box3d/box3d_bridge.js',
    wasmUrl: '/box3d/box3d_bridge.wasm',
}

// Mock fetch to intercept the manifest and WASM binary requests
const mockFetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('bridge-manifest.json')) {
        return {
            ok: true,
            status: 200,
            async text() {
                return JSON.stringify(manifest)
            }
        }
    }
    if (url.endsWith('box3d_bridge.wasm')) {
        return {
            ok: true,
            status: 200,
            async arrayBuffer() {
                // Return a copy of the buffer to avoid sharing underlying ArrayBuffer
                return wasmBuffer.buffer.slice(
                    wasmBuffer.byteOffset,
                    wasmBuffer.byteOffset + wasmBuffer.byteLength
                )
            }
        }
    }
    return {
        ok: false,
        status: 404,
        async text() {
            return 'Not found'
        }
    }
})

globalThis.fetch = mockFetch as any

// Emscripten bridge script expects window and factory function
const globalObj = globalThis as any
globalObj.window = globalThis
globalObj.createMarbleBox3DBridgeModule = createMarbleBox3DBridgeModule

// Helper to generate terrain heights matching Box3DBetaPlaceholder
const WIDTH = 64
const DEPTH = 64
const SCALE = 2

function generateTerrainHeights() {
    const heights: number[] = []
    for (let z = 0; z < DEPTH; z++) {
        for (let x = 0; x < WIDTH; x++) {
            const xn = (x / WIDTH) * 5
            const zn = (z / DEPTH) * 5
            const y = Math.sin(xn * 1.5) * Math.cos(zn * 1.5) * 2.5 + Math.sin(xn * 4 + zn * 2) * 0.8
            heights.push(y)
        }
    }
    return heights
}

describe('Box3D Headless Physical Integration (Feel Invariants)', () => {
    it('F1: Enemy in chase catches a stationary player from 20u in < 8s at default tuning', async () => {
        // Confirm the bridge is available and load it
        const status = await loadBox3DBridge()
        expect(status.available).toBe(true)

        const bridge = await loadBox3DBridgeModule()
        expect(bridge.health()).toBe(1)

        const world = new Box3DWorld(bridge)
        world.reset()

        // 1. Create Flat Ground (Static Box)
        // Box3D expects half-extents: world.createStaticBox(x, y, z, hx, hy, hz, friction, restitution)
        const groundBody = world.createStaticBox(0, 0, 0, 100, 0.5, 100, 0.5, 0.1)

        // 2. Load settings from game store defaults
        const settings = useGameStore.getState()
        const enemySize = settings.enemySize
        const enemyMass = settings.enemyMass
        const enemySpeed = settings.enemySpeed
        const enemyAirControl = settings.enemyAirControl

        // 3. Create Player Sphere body (stationary, radius 0.5, sitting on ground at Y = 0.5 + 0.5 = 1.0)
        const playerBody = world.createDynamicSphere(0, 1.0, 0, 0.5, 1.0, 0.6, 0.2)
        world.setDamping(playerBody, 0.1, 0.4)

        // 4. Create Enemy Sphere body (20 units away on Z-axis, radius enemySize, sitting on ground at Y = 0.5 + enemySize)
        const enemyBody = world.createDynamicSphere(0, 0.5 + enemySize, -20, enemySize, enemyMass, 0.8, 0.1)
        world.setDamping(enemyBody, 0.8, 0.3)

        // Setup AI State
        const aiState = createAIState()
        const cachedTarget = new THREE.Vector3()
        const playerPosVec = new THREE.Vector3()
        const playerVelVec = new THREE.Vector3(0, 0, 0)
        const enemyPosVec = new THREE.Vector3()
        const lastAvoidanceForce = new THREE.Vector3()

        let elapsed = 0.0
        const dt = 1 / 60
        const aiInterval = 0.1
        let lastAiTime = -aiInterval // Force instant first AI update

        let caught = false
        const maxTime = 8.0 // F1 limit is 8 seconds

        // Run simulation loop
        while (elapsed < maxTime) {
            // Read player and enemy transforms
            const playerTrans = world.readBodyTransform(playerBody)
            playerPosVec.set(playerTrans.position.x, playerTrans.position.y, playerTrans.position.z)

            const enemyTrans = world.readBodyTransform(enemyBody)
            enemyPosVec.set(enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z)
            const enemyVel = world.getLinearVelocity(enemyBody)

            const dx = playerTrans.position.x - enemyTrans.position.x
            const dy = playerTrans.position.y - enemyTrans.position.y
            const dz = playerTrans.position.z - enemyTrans.position.z
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

            // Check contact tag condition (same as Box3DBetaPlaceholder.tsx:397)
            if (dist < (enemySize + 0.5 + 0.1)) {
                caught = true
                console.log(`[TICK] Caught player at elapsed=${elapsed.toFixed(3)}s, dist=${dist.toFixed(3)}`)
                break
            }

            // AI Update (Throttled at 10Hz)
            if (elapsed - lastAiTime >= aiInterval) {
                lastAiTime = elapsed

                // Check Line-of-sight
                let canSee = false
                let hitFraction = 1.0
                if (dist < 40) {
                    const visionHit = world.raycastClosest(
                        enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z,
                        dx, dy, dz
                    )
                    // The ray ends at the player center. The player has a radius of 0.5.
                    // The expected hit fraction when hitting the player sphere boundary is (dist - 0.5) / dist.
                    // Any obstacle in between would result in a lower fraction.
                    const expectedFraction = (dist - 0.5 - 0.05) / dist
                    canSee = !visionHit.hit || visionHit.fraction >= expectedFraction
                    hitFraction = visionHit.fraction
                }

                const prevState = aiState.state
                // AI state machine tick
                updateAIState(aiState, canSee, playerPosVec, aiInterval, playerVelVec)

                if (aiState.state !== prevState) {
                    console.log(`[AI STATE CHANGE] ${prevState} -> ${aiState.state} at elapsed=${elapsed.toFixed(3)}s (canSee=${canSee}, fraction=${hitFraction.toFixed(3)}, dist=${dist.toFixed(3)})`)
                }

                // Get target
                getMovementTarget(aiState, enemyPosVec, playerPosVec, playerVelVec, cachedTarget)

                // Simple avoidance check
                const toTargetX = cachedTarget.x - enemyTrans.position.x
                const toTargetZ = cachedTarget.z - enemyTrans.position.z
                const toTargetLen = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ)
                const desiredX = toTargetLen > 0.01 ? toTargetX / toTargetLen : 0
                const desiredZ = toTargetLen > 0.01 ? toTargetZ / toTargetLen : 0

                const enemyVelLen = Math.sqrt(enemyVel.x * enemyVel.x + enemyVel.z * enemyVel.z)
                const velDirX = enemyVelLen > 0.01 ? enemyVel.x / enemyVelLen : desiredX
                const velDirZ = enemyVelLen > 0.01 ? enemyVel.z / enemyVelLen : desiredZ

                const checkDirX = enemyVelLen > 1 ? velDirX : desiredX
                const checkDirZ = enemyVelLen > 1 ? velDirZ : desiredZ

                const rayLen = enemySize + 2.4
                const avoidHit = world.raycastClosest(
                    enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z,
                    checkDirX * rayLen, 0, checkDirZ * rayLen
                )

                lastAvoidanceForce.set(0, 0, 0)
                if (avoidHit.hit) {
                    const angle = Math.PI / 3
                    const cosA = Math.cos(angle)
                    const sinA = Math.sin(angle)
                    const rotX = checkDirX * cosA - checkDirZ * sinA
                    const rotZ = checkDirX * sinA + checkDirZ * cosA
                    lastAvoidanceForce.set(rotX * 20, 0, rotZ * 20)
                }
            }

            // Grounding check for enemy
            const groundHit = world.raycastClosest(
                enemyTrans.position.x, enemyTrans.position.y, enemyTrans.position.z,
                0, -(enemySize + 0.4), 0
            )
            const isEnemyGrounded = groundHit.hit && groundHit.fraction <= ((enemySize + 0.2) / (enemySize + 0.4))
            const enemyControl = isEnemyGrounded ? 1.0 : enemyAirControl

            // Direction heading
            let moveX = playerTrans.position.x - enemyTrans.position.x
            let moveZ = playerTrans.position.z - enemyTrans.position.z
            if (aiState.state !== 'chase' && aiState.state !== 'alert') {
                moveX = cachedTarget.x - enemyTrans.position.x
                moveZ = cachedTarget.z - enemyTrans.position.z
            }

            const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ)
            const headingX = moveLen > 0.01 ? moveX / moveLen : 0
            const headingZ = moveLen > 0.01 ? moveZ / moveLen : 0

            let fx = headingX + lastAvoidanceForce.x
            let fz = headingZ + lastAvoidanceForce.z

            // Steering brake overshoot alignment
            const enemyVelLen = Math.sqrt(enemyVel.x * enemyVel.x + enemyVel.z * enemyVel.z)
            if (enemyVelLen > 2) {
                const velDirX = enemyVel.x / enemyVelLen
                const velDirZ = enemyVel.z / enemyVelLen
                const alignment = velDirX * headingX + velDirZ * headingZ
                if (alignment < 0.3) {
                    const brakingStrength = (1 - alignment) * enemyVelLen * 0.5
                    fx -= velDirX * brakingStrength
                    fz -= velDirZ * brakingStrength
                }
            }

            // Apply steering force
            const speedMultiplier = settings.useV2AI ? (aiState.state === 'chase' ? 1.3 : 1.0) : 1.0
            const forceStrength = enemySpeed * speedMultiplier * 15 * enemyControl
            world.applyForceToCenter(enemyBody, fx * forceStrength, 0, fz * forceStrength)

            // Step the simulation
            world.step(dt)
            elapsed += dt
        }

        console.log(`Simulation complete. Enemy state: ${aiState.state}, caught: ${caught}, time: ${elapsed.toFixed(3)}s`)
        expect(caught).toBe(true)
        expect(elapsed).toBeLessThan(maxTime)

        world.destroy()
    })
})
