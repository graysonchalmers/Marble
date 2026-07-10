import { describe, it, expect } from 'vitest'
import { computeEjection, ejectVector } from './unstick'

const P = { ejectSpeed: 12, ejectUp: 4 }

describe('ejectVector', () => {
    it('ejects out the nearer +X face when X penetration is smallest', () => {
        // Ball is 0.1 inside the +X face (dx close to +half) and deep on Z → exit +X.
        const v = ejectVector(1.9, 0.2, 2, 2, P)
        expect(v).toEqual({ x: 12, y: 4, z: 0 })
    })
    it('ejects out the nearer -Z face when Z penetration is smallest', () => {
        const v = ejectVector(0.2, -1.9, 2, 2, P)
        expect(v).toEqual({ x: 0, y: 4, z: -12 })
    })
    it('always adds the upward pop', () => {
        expect(ejectVector(0, 0, 2, 2, P).y).toBe(4)
    })
})

describe('computeEjection', () => {
    const cubes = [{ x: 10, y: 2, z: 0 }, { x: -8, y: 2, z: 5 }]
    const cubeScale = 4 // half-extent 2

    it('returns null when the ball is in open space (no obstacle contains it)', () => {
        expect(computeEjection(0, 1, 0, cubes, cubeScale, [], 3, 12, P)).toBeNull()
    })

    it('returns null when merely resting ON TOP of a cube (center above the collider)', () => {
        // Ball center at y = cube top (2 + 2) + radius → dy = 2+ → outside the AABB.
        expect(computeEjection(10, 4.5, 0, cubes, cubeScale, [], 3, 12, P)).toBeNull()
    })

    it('ejects when the ball center is embedded inside a cube', () => {
        // Slightly off-center inside cube 0 → nearest face is +X.
        const v = computeEjection(10.5, 2, 0.2, cubes, cubeScale, [], 3, 12, P)
        expect(v).not.toBeNull()
        expect(v!.x).toBe(12)
        expect(v!.y).toBe(4)
    })

    it('ejects when embedded in a tall column (square-footprint × height collider)', () => {
        const columns = [{ x: 0, y: 6, z: 0 }]
        // Column footprint half = 1.5, height half = 6. Ball at (0.1, 5, 1.3): nearest face
        // is +Z (only 0.2 inside it) vs +X (1.4 inside) → exits out the +Z face.
        const v = computeEjection(0.1, 5, 1.3, [], 4, columns, 3, 12, P)
        expect(v).not.toBeNull()
        expect(v!.z).toBe(12)
        expect(v!.x).toBe(0)
    })

    it('is deterministic — same inputs give the same ejection', () => {
        const a = computeEjection(10.5, 2, 0.2, cubes, cubeScale, [], 3, 12, P)
        const b = computeEjection(10.5, 2, 0.2, cubes, cubeScale, [], 3, 12, P)
        expect(a).toEqual(b)
    })
})
