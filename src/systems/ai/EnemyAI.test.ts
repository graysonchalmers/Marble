import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createAIState, updateAIState, getMovementTarget } from './EnemyAI'

const ZERO = () => new THREE.Vector3(0, 0, 0)
const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

describe('EnemyAI state machine (feel invariants)', () => {
    it('F3: alert -> chase transitions at exactly 0.5s of continuous visibility, not before', () => {
        const ai = createAIState()
        const playerPos = at(5, 0, 0)

        // idle -> alert (player becomes visible)
        updateAIState(ai, true, playerPos, 0, ZERO())
        expect(ai.state).toBe('alert')

        // Advance in small steps up to just under 0.5s — must still be alert
        for (let i = 0; i < 4; i++) {
            updateAIState(ai, true, playerPos, 0.1, ZERO()) // 0.1 * 4 = 0.4s
        }
        expect(ai.state).toBe('alert')

        // One more tick crosses the 0.5s threshold — must now be chase
        updateAIState(ai, true, playerPos, 0.1, ZERO()) // 0.5s total
        expect(ai.state).toBe('chase')
    })

    it('F4: losing line-of-sight in chase drops to search within one tick, with a velocity-projected first waypoint (<=15u ahead)', () => {
        const ai = createAIState()
        const playerPos = at(0, 0, 0)
        const playerVel = at(3, 0, 0) // moving in +x

        // Force into chase: idle -> alert -> chase (0.5s+ visible)
        updateAIState(ai, true, playerPos, 0, ZERO())
        updateAIState(ai, true, playerPos, 0.6, ZERO())
        expect(ai.state).toBe('chase')
        ai.lastKnownPlayerPos.copy(playerPos)

        // Lose sight — must transition within this single tick, not linger in chase
        const stateAfter = updateAIState(ai, false, playerPos, 0.016, playerVel)
        expect(stateAfter).toBe('search')
        expect(ai.state).toBe('search')

        // First waypoint should be projected along player velocity, capped at 15u
        const wp0 = ai.searchWaypoints[0]
        const dist = wp0.distanceTo(ai.lastKnownPlayerPos)
        expect(dist).toBeLessThanOrEqual(15 + 1e-6)
        expect(dist).toBeGreaterThan(0)
        // Projected point should be roughly in the +x direction (velocity direction), not behind
        expect(wp0.x).toBeGreaterThan(ai.lastKnownPlayerPos.x)
    })

    it('F2: AI never re-enters idle once first contact has happened (search loops forever)', () => {
        const ai = createAIState()
        const playerPos = at(20, 0, 0)
        const vel = at(1, 0, 0)

        // First contact -> alert -> chase -> lose sight -> search
        updateAIState(ai, true, playerPos, 0, ZERO())
        updateAIState(ai, true, playerPos, 0.6, ZERO())
        updateAIState(ai, false, playerPos, 0.016, vel)
        expect(ai.state).toBe('search')

        // Run search well past SEARCH_DURATION (5s) many times over, still not visible
        for (let i = 0; i < 50; i++) {
            const s = updateAIState(ai, false, playerPos, 1, vel)
            expect(s).not.toBe('idle')
        }
        expect(ai.state).toBe('search')
    })

    it('sanity: idle stays idle until player becomes visible', () => {
        const ai = createAIState()
        expect(ai.state).toBe('idle')
        updateAIState(ai, false, at(100, 0, 0), 1, ZERO())
        expect(ai.state).toBe('idle')
    })

    it('sanity: getMovementTarget in search cycles through waypoints as they are reached', () => {
        const ai = createAIState()
        updateAIState(ai, true, at(0, 0, 0), 0, ZERO())
        updateAIState(ai, true, at(0, 0, 0), 0.6, ZERO())
        updateAIState(ai, false, at(0, 0, 0), 0.016, at(1, 0, 0))
        expect(ai.state).toBe('search')
        expect(ai.searchWaypoints.length).toBeGreaterThan(0)

        const firstTarget = getMovementTarget(ai, at(0, 0, 0), at(0, 0, 0), ZERO())
        expect(firstTarget).toEqual(ai.searchWaypoints[0])
    })
})
