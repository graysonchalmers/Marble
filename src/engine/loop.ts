/**
 * engine/loop.ts — Fixed-timestep game loop driver (ARCHITECTURE §4).
 *
 * Phase 0: exists and is unit-tested, but NOT yet wired into the game.
 * Phase 1 item 5 wires systems into it (input → AI → physics → rules → sonar).
 *
 * Design:
 * - Accumulator pattern: simulate at fixed `simRate` Hz regardless of render rate.
 * - Render interpolation via `alpha` (fraction of a sim step the accumulator holds).
 * - Clamped frame delta guards against spiral-of-death after tab-suspend.
 * - Zero React imports. Zero allocations in `advance()` hot path.
 */

export type TickFn = (dt: number) => void
export type RenderFn = (alpha: number) => void

export interface LoopOptions {
    /** Simulation rate in Hz. Default 60. */
    simRate?: number
    /** Max seconds of real time consumed per frame (spiral-of-death guard). Default 0.25. */
    maxFrameDelta?: number
}

export class GameLoop {
    readonly stepSize: number
    private readonly maxFrameDelta: number
    private accumulator = 0
    private tickFns: TickFn[] = []
    private renderFn: RenderFn | null = null
    private running = false
    private lastTime = 0
    private rafId = 0
    /** Total fixed steps executed (diagnostics / determinism checks). */
    stepCount = 0

    constructor(opts: LoopOptions = {}) {
        const simRate = opts.simRate ?? 60
        if (simRate <= 0) throw new Error(`simRate must be > 0, got ${simRate}`)
        this.stepSize = 1 / simRate
        this.maxFrameDelta = opts.maxFrameDelta ?? 0.25
    }

    /** Register a system tick. Order of registration = order of execution. */
    addTick(fn: TickFn): void {
        this.tickFns.push(fn)
    }

    removeTick(fn: TickFn): void {
        const i = this.tickFns.indexOf(fn)
        if (i !== -1) this.tickFns.splice(i, 1)
    }

    /** Register the render callback (receives interpolation alpha 0..1). */
    setRender(fn: RenderFn | null): void {
        this.renderFn = fn
    }

    /**
     * Advance the loop by `frameDelta` seconds of real time.
     * Runs zero or more fixed steps, then one render with interpolation alpha.
     * Public so tests (and headless feel-harness runs) can drive time manually.
     */
    advance(frameDelta: number): void {
        this.accumulator += Math.min(frameDelta, this.maxFrameDelta)
        while (this.accumulator >= this.stepSize) {
            for (let i = 0; i < this.tickFns.length; i++) {
                this.tickFns[i](this.stepSize)
            }
            this.accumulator -= this.stepSize
            this.stepCount++
        }
        if (this.renderFn) this.renderFn(this.accumulator / this.stepSize)
    }

    /** Interpolation fraction currently held in the accumulator (0..1). */
    get alpha(): number {
        return this.accumulator / this.stepSize
    }

    get isRunning(): boolean {
        return this.running
    }

    /** Start RAF-driven loop (browser). Tests use advance() directly instead. */
    start(now: () => number = () => performance.now()): void {
        if (this.running) return
        this.running = true
        this.lastTime = now()
        const frame = () => {
            if (!this.running) return
            const t = now()
            this.advance((t - this.lastTime) / 1000)
            this.lastTime = t
            this.rafId = requestAnimationFrame(frame)
        }
        this.rafId = requestAnimationFrame(frame)
    }

    stop(): void {
        this.running = false
        if (this.rafId) cancelAnimationFrame(this.rafId)
        this.rafId = 0
    }

    /** Reset accumulator + counters (e.g. on restart — no page reload!). */
    reset(): void {
        this.accumulator = 0
        this.stepCount = 0
    }
}
