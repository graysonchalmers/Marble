import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { ParticleSystem } from './ParticleSystem'

describe('ParticleSystem (pooled, render-side)', () => {
    it('starts empty and exposes a THREE.Points', () => {
        const ps = new ParticleSystem(50)
        expect(ps.aliveCount).toBe(0)
        expect(ps.points).toBeInstanceOf(THREE.Points)
    })

    it('emitBurst spawns the requested count and update integrates + expires them', () => {
        const ps = new ParticleSystem(100)
        ps.emitBurst(0, 0, 0, { count: 10, speed: 2, life: 0.4 })
        expect(ps.aliveCount).toBe(10)

        ps.update(0.001) // one tiny step — all still alive
        expect(ps.aliveCount).toBe(10)

        // Advance well past the max life (0.4 * up-to-1.3 jitter) → all expire.
        for (let i = 0; i < 20; i++) ps.update(0.1)
        expect(ps.aliveCount).toBe(0)
        expect(ps.points.geometry.drawRange.count).toBe(0)
    })

    it('emitTrail adds a single particle', () => {
        const ps = new ParticleSystem(50)
        ps.emitTrail(1, 2, 3, { vx: 10, vz: 0, life: 0.5 })
        expect(ps.aliveCount).toBe(1)
    })

    it('never exceeds capacity', () => {
        const ps = new ParticleSystem(16)
        ps.emitBurst(0, 0, 0, { count: 100, speed: 2, life: 1 })
        expect(ps.aliveCount).toBe(16)
    })

    it('clear() drops all live particles', () => {
        const ps = new ParticleSystem(50)
        ps.emitBurst(0, 0, 0, { count: 8, speed: 2, life: 1 })
        ps.clear()
        expect(ps.aliveCount).toBe(0)
    })
})
