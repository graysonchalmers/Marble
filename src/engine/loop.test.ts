import { describe, it, expect } from 'vitest'
import { GameLoop } from './loop'
import { EventBus } from './events'

describe('GameLoop (fixed timestep)', () => {
    it('runs the exact number of fixed steps for elapsed time', () => {
        const loop = new GameLoop({ simRate: 60 })
        let ticks = 0
        loop.addTick(() => ticks++)

        // 60 frames at exactly one step each (staying under the frame-delta clamp)
        for (let i = 0; i < 60; i++) loop.advance(1 / 60)
        expect(ticks).toBe(60)
        expect(loop.stepCount).toBe(60)
    })

    it('always ticks with a constant dt regardless of frame delta', () => {
        const loop = new GameLoop({ simRate: 60 })
        const dts: number[] = []
        loop.addTick((dt) => dts.push(dt))

        // Jittery frame times
        for (const fd of [0.016, 0.031, 0.009, 0.05, 0.001]) loop.advance(fd)

        expect(dts.length).toBeGreaterThan(0)
        for (const dt of dts) expect(dt).toBeCloseTo(1 / 60, 10)
    })

    it('accumulates leftover time (no lost simulation)', () => {
        const loop = new GameLoop({ simRate: 60 })
        let ticks = 0
        loop.addTick(() => ticks++)

        loop.advance(0.01) // < one step → 0 ticks, time banked
        expect(ticks).toBe(0)
        loop.advance(0.01) // 0.02 total → 1 step
        expect(ticks).toBe(1)
        expect(loop.alpha).toBeGreaterThanOrEqual(0)
        expect(loop.alpha).toBeLessThan(1)
    })

    it('ticks systems in registration order (input→AI→physics→rules→sonar)', () => {
        const loop = new GameLoop({ simRate: 60 })
        const order: string[] = []
        for (const name of ['input', 'ai', 'physics', 'rules', 'sonar']) {
            loop.addTick(() => order.push(name))
        }
        loop.advance(1 / 60)
        expect(order).toEqual(['input', 'ai', 'physics', 'rules', 'sonar'])
    })

    it('clamps huge frame deltas (spiral-of-death guard)', () => {
        const loop = new GameLoop({ simRate: 60, maxFrameDelta: 0.25 })
        let ticks = 0
        loop.addTick(() => ticks++)

        loop.advance(10) // tab suspended 10s → only 0.25s simulated
        expect(ticks).toBe(15) // 0.25 * 60
    })

    it('passes interpolation alpha to render', () => {
        const loop = new GameLoop({ simRate: 60 })
        loop.addTick(() => {})
        let alpha = -1
        loop.setRender((a) => (alpha = a))

        loop.advance(1 / 60 + 1 / 120) // one step + half a step leftover
        expect(alpha).toBeCloseTo(0.5, 5)
    })

    it('reset clears accumulator and counters (restart without reload)', () => {
        const loop = new GameLoop({ simRate: 60 })
        loop.addTick(() => {})
        for (let i = 0; i < 30; i++) loop.advance(1 / 60)
        expect(loop.stepCount).toBe(30)
        loop.reset()
        expect(loop.stepCount).toBe(0)
        expect(loop.alpha).toBe(0)
    })
})

describe('EventBus', () => {
    it('delivers typed payloads and supports unsubscribe', () => {
        const bus = new EventBus()
        const got: number[] = []
        const off = bus.on('tagged', (p) => got.push(p.survivalTime))

        bus.emit('tagged', { survivalTime: 42 })
        off()
        bus.emit('tagged', { survivalTime: 99 })

        expect(got).toEqual([42])
    })
})
