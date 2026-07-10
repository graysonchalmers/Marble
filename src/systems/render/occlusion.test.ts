import { describe, it, expect } from 'vitest'
import { segmentIntersectsCube, findOccludingCubes, segmentIntersectsBox, findOccludingBoxes } from './occlusion'

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

describe('segmentIntersectsBox (non-uniform / column extents)', () => {
    it('a tall pillar is hit high up where a same-footprint cube would be missed', () => {
        // Sightline at y=3 through the x-axis. Footprint half 0.5 on X/Z.
        // Cube (half 0.5 on Y too) tops out at y=0.5 → missed. Tall column (half-height 6) → hit.
        const seg = [-5, 3, 0, 5, 3, 0] as const
        const box = [0, 0, 0] as const
        expect(segmentIntersectsCube(...seg, ...box, 0.5)).toBe(false)
        expect(segmentIntersectsBox(...seg, ...box, 0.5, 6, 0.5)).toBe(true)
    })

    it('still misses when the sightline clears the top of the pillar', () => {
        // Half-height 6 → top at y=6; a ray at y=7 passes over.
        expect(segmentIntersectsBox(-5, 7, 0, 5, 7, 0, 0, 0, 0, 0.5, 6, 0.5)).toBe(false)
    })

    it('respects the narrow footprint off to the side', () => {
        // Ray offset x=2 misses a 0.5-wide pillar centered at origin.
        expect(segmentIntersectsBox(2, 3, -5, 2, 3, 5, 0, 0, 0, 0.5, 6, 0.5)).toBe(false)
    })
})

describe('findOccludingBoxes (columns)', () => {
    it('finds a tall pillar blocking the sightline at an elevated crossing, nearest-first', () => {
        // Camera high, player low; the line crosses the pillars up where cubes would not reach.
        const cam = { x: 0, y: 5, z: 12 }
        const player = { x: 0, y: 0.5, z: 0 }
        const centers = [
            { x: 0, y: 0, z: 8 },  // 0: pillar near the camera end
            { x: 0, y: 0, z: 3 },  // 1: pillar closer to the player
            { x: 5, y: 0, z: 5 }   // 2: off to the side, should miss
        ]
        // Footprint half 1.5, half-height 6 (tall).
        const occ = findOccludingBoxes(cam, player, centers, 1.5, 6, 1.5)
        expect(occ).toEqual([0, 1])
    })
})

describe('findOccludingBoxes (maxPlayerDist — camera-lag corridor cap)', () => {
    // Simulate a lagging chase camera far behind a fast ball: the sightline is long
    // and passes through obstacles both near the ball and far back near the camera.
    const cam = { x: 0, y: 0.5, z: 40 }  // camera trails ~40u behind, roughly ball-height
    const player = { x: 0, y: 0.5, z: 0 }
    const centers = [
        { x: 0, y: 0, z: 4 },   // 0: right in front of the ball (~4u away)
        { x: 0, y: 0, z: 30 },  // 1: far back, near the lagging camera (~30u from ball)
    ]

    it('with no cap (default Infinity), fades both the near AND the far-back obstacle', () => {
        const occ = findOccludingBoxes(cam, player, centers, 1, 1, 1)
        expect(occ.sort()).toEqual([0, 1])
    })

    it('with maxPlayerDist=16, fades only the obstacle near the ball — not the far corridor', () => {
        const occ = findOccludingBoxes(cam, player, centers, 1, 1, 1, 8, 0.6, 16)
        expect(occ).toEqual([0])
    })

    it('ignores vertical distance (a tall pillar beside the ball still counts)', () => {
        // Pillar center is 6u above the ball but only 3u away horizontally.
        const tallCenters = [{ x: 0, y: 6, z: 3 }]
        const occ = findOccludingBoxes(cam, player, tallCenters, 1.5, 6, 1.5, 8, 0.6, 16)
        expect(occ).toEqual([0])
    })
})
