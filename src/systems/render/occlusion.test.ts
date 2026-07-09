import { describe, it, expect } from 'vitest'
import { segmentIntersectsCube, findOccludingCubes } from './occlusion'

describe('segmentIntersectsCube', () => {
    it('true when the segment passes through the cube', () => {
        // Unit-ish cube at origin (half 1); horizontal segment straight through.
        expect(segmentIntersectsCube(-5, 0, 0, 5, 0, 0, 0, 0, 0, 1)).toBe(true)
    })

    it('false when the segment passes above the cube', () => {
        expect(segmentIntersectsCube(-5, 3, 0, 5, 3, 0, 0, 0, 0, 1)).toBe(false)
    })

    it('false when the cube is beyond the segment end', () => {
        // Segment ends at x=0; cube centered at x=5 is past it.
        expect(segmentIntersectsCube(-5, 0, 0, 0, 0, 0, 5, 0, 0, 1)).toBe(false)
    })
})

describe('findOccludingCubes', () => {
    const cam = { x: 0, y: 0, z: 10 }
    const player = { x: 0, y: 0, z: 0 }

    it('returns cubes on the sightline, nearest-first, and ignores off-line / behind cubes', () => {
        const centers = [
            { x: 0, y: 0, z: 7 },   // 0: on the line, nearest the camera
            { x: 0, y: 0, z: 3 },   // 1: on the line, farther
            { x: 6, y: 0, z: 5 },   // 2: off to the side
            { x: 0, y: 0, z: -5 }   // 3: behind the player
        ]
        const occ = findOccludingCubes(cam, player, centers, 1)
        expect(occ).toEqual([0, 1]) // both blockers, camera-nearest first
    })

    it('caps the result at maxCount', () => {
        const centers = Array.from({ length: 10 }, (_, i) => ({ x: 0, y: 0, z: 9 - i * 0.5 }))
        const occ = findOccludingCubes(cam, player, centers, 1, 3)
        expect(occ.length).toBe(3)
    })
})
