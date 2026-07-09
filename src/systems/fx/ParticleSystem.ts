/**
 * systems/fx/ParticleSystem.ts — lightweight pooled particle system (render-side).
 *
 * Cosmetic only: particles live entirely in the render layer and never touch the
 * deterministic sim (MarbleSim stays zero-alloc / bit-reproducible). A single pooled
 * THREE.Points draw call backs every effect; emitters just push particles into the
 * pool. Add a new effect = add an `emit*` helper (or call `emit()` with new params) —
 * no new draw calls, no scene-graph churn.
 *
 * Particles fade by scaling their colour toward black under additive blending, so a
 * dying particle simply dims out. Gravity is per-particle (trails float, impacts fall).
 */
import * as THREE from 'three'

export interface BurstOptions {
    count: number
    /** Base ejection speed (u/s). */
    speed: number
    /** Horizontal spread multiplier (0 = straight up, 1 = wide). */
    spread?: number
    /** Upward bias fraction of speed. */
    up?: number
    /** Seconds each particle lives (± 30% jitter). */
    life: number
    /** Per-particle vertical accel (negative = falls). */
    gravity?: number
    /** Base colour, linear 0..1. */
    color?: [number, number, number]
}

export interface TrailOptions {
    /** Inherited horizontal velocity to trail against (particle drifts opposite). */
    vx: number
    vz: number
    life: number
    color?: [number, number, number]
    /** Random position scatter radius. */
    jitter?: number
}

const DEFAULT_COLOR: [number, number, number] = [0.6, 0.85, 1.0]

export class ParticleSystem {
    readonly points: THREE.Points
    readonly capacity: number

    private readonly px: Float32Array
    private readonly py: Float32Array
    private readonly pz: Float32Array
    private readonly vx: Float32Array
    private readonly vy: Float32Array
    private readonly vz: Float32Array
    private readonly gy: Float32Array
    private readonly life: Float32Array
    private readonly maxLife: Float32Array
    private readonly cr: Float32Array
    private readonly cg: Float32Array
    private readonly cb: Float32Array

    /** Number of live particles (kept contiguous in [0, count)). */
    private count = 0

    private readonly posAttr: THREE.BufferAttribute
    private readonly colAttr: THREE.BufferAttribute

    constructor(capacity = 800, size = 0.35) {
        this.capacity = capacity
        this.px = new Float32Array(capacity)
        this.py = new Float32Array(capacity)
        this.pz = new Float32Array(capacity)
        this.vx = new Float32Array(capacity)
        this.vy = new Float32Array(capacity)
        this.vz = new Float32Array(capacity)
        this.gy = new Float32Array(capacity)
        this.life = new Float32Array(capacity)
        this.maxLife = new Float32Array(capacity)
        this.cr = new Float32Array(capacity)
        this.cg = new Float32Array(capacity)
        this.cb = new Float32Array(capacity)

        const geometry = new THREE.BufferGeometry()
        this.posAttr = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3)
        this.colAttr = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3)
        this.posAttr.setUsage(THREE.DynamicDrawUsage)
        this.colAttr.setUsage(THREE.DynamicDrawUsage)
        geometry.setAttribute('position', this.posAttr)
        geometry.setAttribute('color', this.colAttr)
        geometry.setDrawRange(0, 0)

        const material = new THREE.PointsMaterial({
            size,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        })

        this.points = new THREE.Points(geometry, material)
        this.points.frustumCulled = false // positions change every frame; don't cull on a stale bounds
    }

    get aliveCount(): number {
        return this.count
    }

    /** Spawn one particle. Returns false if the pool is full. */
    emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, gravity: number, color: [number, number, number]): boolean {
        if (this.count >= this.capacity) return false
        const i = this.count++
        this.px[i] = x; this.py[i] = y; this.pz[i] = z
        this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz
        this.gy[i] = gravity
        this.life[i] = life; this.maxLife[i] = life
        this.cr[i] = color[0]; this.cg[i] = color[1]; this.cb[i] = color[2]
        return true
    }

    /** Radial burst — impacts (wall hits, hard landings). */
    emitBurst(x: number, y: number, z: number, opts: BurstOptions): void {
        const spread = opts.spread ?? 1
        const up = opts.up ?? 0.6
        const gravity = opts.gravity ?? -8
        const color = opts.color ?? DEFAULT_COLOR
        for (let k = 0; k < opts.count; k++) {
            const a = Math.random() * Math.PI * 2
            const r = Math.random()
            const vx = Math.cos(a) * r * opts.speed * spread
            const vz = Math.sin(a) * r * opts.speed * spread
            const vy = (up + Math.random() * 0.4) * opts.speed
            const life = opts.life * (0.7 + Math.random() * 0.6)
            if (!this.emit(x, y, z, vx, vy, vz, life, gravity, color)) return
        }
    }

    /** One trailing particle dropped behind a rolling ball (speed denotation). */
    emitTrail(x: number, y: number, z: number, opts: TrailOptions): void {
        const jitter = opts.jitter ?? 0.2
        const color = opts.color ?? DEFAULT_COLOR
        const ox = (Math.random() - 0.5) * 2 * jitter
        const oz = (Math.random() - 0.5) * 2 * jitter
        // Drift gently up and slightly against travel so the trail lingers behind.
        const vx = -opts.vx * 0.05 + (Math.random() - 0.5) * 0.4
        const vz = -opts.vz * 0.05 + (Math.random() - 0.5) * 0.4
        const vy = 0.3 + Math.random() * 0.5
        const life = opts.life * (0.7 + Math.random() * 0.6)
        this.emit(x + ox, y, z + oz, vx, vy, vz, life, 0.5, color)
    }

    /** Integrate + fade one render step, then push the live set into the draw buffers. */
    update(dt: number): void {
        let i = 0
        while (i < this.count) {
            const nl = this.life[i] - dt
            if (nl <= 0) {
                // Swap-remove: move the last live particle into this slot.
                const last = this.count - 1
                if (i !== last) {
                    this.px[i] = this.px[last]; this.py[i] = this.py[last]; this.pz[i] = this.pz[last]
                    this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last]; this.vz[i] = this.vz[last]
                    this.gy[i] = this.gy[last]
                    this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last]
                    this.cr[i] = this.cr[last]; this.cg[i] = this.cg[last]; this.cb[i] = this.cb[last]
                }
                this.count--
                continue // re-check the swapped-in particle at the same index
            }
            this.life[i] = nl
            this.px[i] += this.vx[i] * dt
            this.py[i] += this.vy[i] * dt
            this.pz[i] += this.vz[i] * dt
            this.vy[i] += this.gy[i] * dt
            i++
        }

        // Write the live prefix into the geometry buffers (fade colour by remaining life).
        const pos = this.posAttr.array as Float32Array
        const col = this.colAttr.array as Float32Array
        for (let j = 0; j < this.count; j++) {
            const o = j * 3
            pos[o] = this.px[j]; pos[o + 1] = this.py[j]; pos[o + 2] = this.pz[j]
            const f = this.life[j] / this.maxLife[j]
            col[o] = this.cr[j] * f; col[o + 1] = this.cg[j] * f; col[o + 2] = this.cb[j] * f
        }
        this.posAttr.needsUpdate = true
        this.colAttr.needsUpdate = true
        this.points.geometry.setDrawRange(0, this.count)
    }

    /** Drop all live particles (round reset). */
    clear(): void {
        this.count = 0
        this.points.geometry.setDrawRange(0, 0)
    }

    dispose(): void {
        this.points.geometry.dispose()
        ;(this.points.material as THREE.Material).dispose()
    }
}
