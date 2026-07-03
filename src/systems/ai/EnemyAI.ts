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

/**
 * Create initial AI state
 */
export function createAIState(): EnemyAIState {
    return {
        state: 'idle',
        stateTimer: 0,
        lastKnownPlayerPos: new THREE.Vector3(),
        searchWaypoints: [],
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
 * Generate search waypoints around last known position
 */
/**
 * Generate search waypoints with smart projection
 */
function generateSearchWaypoints(lastKnownPos: THREE.Vector3, playerVel: THREE.Vector3): THREE.Vector3[] {
    const waypoints: THREE.Vector3[] = []

    // 1. First waypoint: Extrapolate where player was going
    const speed = playerVel.length()
    const projectionDist = Math.min(speed * 2, 15) // Predict up to 2 seconds or 15 units
    const projectedPos = lastKnownPos.clone().add(playerVel.clone().normalize().multiplyScalar(projectionDist))

    // Add jitter if speed is low, otherwise trust the velocity
    if (speed < 1) {
        projectedPos.add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5))
    }

    waypoints.push(projectedPos)

    // 2. Subsequent waypoints: Spiral out from projected pos
    const searchRadius = 15
    const angleStep = Math.PI / 1.5 // Fewer, larger steps

    for (let i = 1; i < 4; i++) {
        const angle = i * angleStep + Math.random() * 1.0
        waypoints.push(new THREE.Vector3(
            lastKnownPos.x + Math.cos(angle) * searchRadius,
            lastKnownPos.y,
            lastKnownPos.z + Math.sin(angle) * searchRadius
        ))
    }

    return waypoints
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
    playerVel: THREE.Vector3 // Passed in for smart search
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
                ai.searchWaypoints = generateSearchWaypoints(ai.lastKnownPlayerPos, playerVel)
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
                ai.searchWaypoints = generateSearchWaypoints(ai.lastKnownPlayerPos, playerVel)
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
                ai.searchWaypoints = generateSearchWaypoints(ai.lastKnownPlayerPos, new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5))
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
 * Get movement target based on current state
 */
export function getMovementTarget(
    ai: EnemyAIState,
    enemyPos: THREE.Vector3,
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3
): THREE.Vector3 {
    switch (ai.state) {
        case 'idle':
            // Just return current pos to stop
            return enemyPos

        case 'alert':
            // Face player
            return playerPos

        case 'chase':
            // Predictive pursuit - Intercept!
            const dist = enemyPos.distanceTo(playerPos)
            // Predict further ahead if far away
            const predictionTime = Math.min(dist / 15, 1.5)
            return playerPos.clone().add(playerVel.clone().multiplyScalar(predictionTime))

        case 'search':
            // Move through waypoints
            if (ai.searchWaypoints.length > 0) {
                const wp = ai.searchWaypoints[ai.currentWaypointIndex]
                // Advance to next waypoint if close
                if (enemyPos.distanceTo(wp) < WAYPOINT_REACH_DIST) {
                    ai.currentWaypointIndex = (ai.currentWaypointIndex + 1) % ai.searchWaypoints.length
                }
                return ai.searchWaypoints[ai.currentWaypointIndex]
            }
            return ai.lastKnownPlayerPos

        default:
            return playerPos
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
