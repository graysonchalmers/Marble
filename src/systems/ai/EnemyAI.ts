import * as THREE from 'three'

// State machine types
export type EnemyState = 'idle' | 'alert' | 'chase' | 'search'

export interface EnemyAIState {
    state: EnemyState
    stateTimer: number
    lastKnownPlayerPos: THREE.Vector3
    searchWaypoints: THREE.Vector3[]
    currentWaypointIndex: number
}

// Configuration
const ALERT_DURATION = 0.5      // Seconds to lock onto target
const SEARCH_DURATION = 5       // Seconds to search before giving up
const VISION_DISTANCE = 25      // Units to detect player
const WAYPOINT_REACH_DIST = 2   // Distance to consider waypoint reached

// Scratch vectors to avoid allocations in updates
const tempDir = new THREE.Vector3()
const tempProjected = new THREE.Vector3()

/**
 * Create initial AI state
 */
export function createAIState(): EnemyAIState {
    return {
        state: 'idle',
        stateTimer: 0,
        lastKnownPlayerPos: new THREE.Vector3(),
        searchWaypoints: [
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3()
        ],
        currentWaypointIndex: 0
    }
}

/**
 * Simple visibility check (distance-based)
 * Can be extended with raycast for obstacle occlusion
 */
export function canSeePlayer(
    enemyPos: THREE.Vector3,
    playerPos: THREE.Vector3
): boolean {
    const distance = enemyPos.distanceTo(playerPos)
    return distance <= VISION_DISTANCE
}

/**
 * Generate search waypoints with smart projection (in-place modification)
 */
function generateSearchWaypoints(
    waypoints: THREE.Vector3[],
    lastKnownPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    rand: () => number = Math.random
): void {
    // Ensure we have exactly 4 waypoints, if not re-initialize them
    while (waypoints.length < 4) {
        waypoints.push(new THREE.Vector3())
    }

    // 1. First waypoint: Extrapolate where player was going
    const speed = playerVel.length()
    const projectionDist = Math.min(speed * 2, 15) // Predict up to 2 seconds or 15 units
    
    waypoints[0].copy(lastKnownPos)
    if (speed > 0.0001) {
        tempDir.copy(playerVel).normalize().multiplyScalar(projectionDist)
        waypoints[0].add(tempDir)
    }

    // Add jitter if speed is low, otherwise trust the velocity
    if (speed < 1) {
        waypoints[0].add(tempProjected.set((rand() - 0.5) * 5, 0, (rand() - 0.5) * 5))
    }

    // 2. Subsequent waypoints: Spiral out from projected pos
    const searchRadius = 15
    const angleStep = Math.PI / 1.5 // Fewer, larger steps

    for (let i = 1; i < 4; i++) {
        const angle = i * angleStep + rand() * 1.0
        waypoints[i].set(
            lastKnownPos.x + Math.cos(angle) * searchRadius,
            lastKnownPos.y,
            lastKnownPos.z + Math.sin(angle) * searchRadius
        )
    }
}

/**
 * Update AI state machine
 * Returns the current state after transitions
 */
export function updateAIState(
    ai: EnemyAIState,
    playerVisible: boolean,
    playerPos: THREE.Vector3,
    delta: number,
    playerVel: THREE.Vector3, // Passed in for smart search
    rand: () => number = Math.random // Seeded stream from MarbleSim for determinism (F9)
): EnemyState {
    ai.stateTimer += delta

    switch (ai.state) {
        case 'idle':
            if (playerVisible) {
                ai.state = 'alert'
                ai.stateTimer = 0
                ai.lastKnownPlayerPos.copy(playerPos)
            }
            break

        case 'alert':
            if (!playerVisible) {
                // If lost immediately, go to search instead of idle
                ai.state = 'search'
                ai.stateTimer = 0
                generateSearchWaypoints(ai.searchWaypoints, ai.lastKnownPlayerPos, playerVel, rand)
            } else if (ai.stateTimer >= ALERT_DURATION) {
                ai.state = 'chase'
                ai.stateTimer = 0
            }
            ai.lastKnownPlayerPos.copy(playerPos)
            break

        case 'chase':
            if (playerVisible) {
                ai.lastKnownPlayerPos.copy(playerPos)
            } else {
                ai.state = 'search'
                ai.stateTimer = 0
                generateSearchWaypoints(ai.searchWaypoints, ai.lastKnownPlayerPos, playerVel, rand)
                ai.currentWaypointIndex = 0
            }
            break

        case 'search':
            if (playerVisible) {
                ai.state = 'chase'
                ai.stateTimer = 0
                ai.lastKnownPlayerPos.copy(playerPos)
            } else if (ai.stateTimer >= SEARCH_DURATION) {
                // NEVER GO IDLE - RESTART SEARCH
                ai.stateTimer = 0
                // Generate new waypoints from CURRENT position to keep searching effectively
                tempDir.set(rand() - 0.5, 0, rand() - 0.5)
                generateSearchWaypoints(ai.searchWaypoints, ai.lastKnownPlayerPos, tempDir, rand)
                ai.currentWaypointIndex = 0
            }
            break
    }

    return ai.state
}

/**
 * Get speed multiplier for current state
 */
export function getSpeedMultiplier(state: EnemyState): number {
    switch (state) {
        case 'idle': return 0.0 // Stop moving when idle
        case 'alert': return 0.1 // Creep forward slightly? Or just turn.
        case 'chase': return 1.5 // FAST
        case 'search': return 1.2 // FAST search
        default: return 1.0
    }
}

/**
 * Get movement target based on current state (writes output to outTarget)
 */
export function getMovementTarget(
    ai: EnemyAIState,
    enemyPos: THREE.Vector3,
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    outTarget: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 {
    switch (ai.state) {
        case 'idle':
            return outTarget.copy(enemyPos)

        case 'alert':
            return outTarget.copy(playerPos)

        case 'chase':
            // Predictive pursuit - Intercept!
            const dist = enemyPos.distanceTo(playerPos)
            const predictionTime = Math.min(dist / 15, 1.5)
            outTarget.copy(playerPos)
            tempDir.copy(playerVel).multiplyScalar(predictionTime)
            return outTarget.add(tempDir)

        case 'search':
            // Move through waypoints
            if (ai.searchWaypoints.length > 0) {
                const wp = ai.searchWaypoints[ai.currentWaypointIndex]
                // Advance to next waypoint if close
                if (enemyPos.distanceTo(wp) < WAYPOINT_REACH_DIST) {
                    ai.currentWaypointIndex = (ai.currentWaypointIndex + 1) % ai.searchWaypoints.length
                }
                return outTarget.copy(ai.searchWaypoints[ai.currentWaypointIndex])
            }
            return outTarget.copy(ai.lastKnownPlayerPos)

        default:
            return outTarget.copy(playerPos)
    }
}

/**
 * Get visual properties for debugging (color based on state)
 */
export function getStateVisuals(state: EnemyState): { color: string; emissive: string } {
    switch (state) {
        case 'idle':
            return { color: '#666666', emissive: '#111111' } // Gray - passive
        case 'alert':
            return { color: '#ffcc00', emissive: '#332200' } // Yellow - warning
        case 'chase':
            return { color: '#ff0000', emissive: '#330000' } // Red - aggressive
        case 'search':
            return { color: '#ff8800', emissive: '#331100' } // Orange - searching
        default:
            return { color: '#ff0000', emissive: '#330000' }
    }
}
