/**
 * Box3DParticles.tsx — cosmetic particle FX for the Box3D scene.
 *
 * Owns one pooled ParticleSystem (single draw call) and drives it from the sim:
 *  - **roll trails:** emitted while the ball is grounded and moving fast (denote speed),
 *  - **impact bursts:** on the sim's `onImpact` event (wall / cube hits),
 *  - **landing bursts:** on the sim's `onLand` event (hard touchdown after a jump/fall).
 *
 * The sim only fires cosmetic events + exposes `playerGrounded`/`playerVel`; all particle
 * state lives here in the render layer, so determinism is untouched. Extend by adding a new
 * emitter call — no new draw calls.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ParticleSystem } from '../../systems/fx/ParticleSystem'
import { PLAYER, FX } from '../../systems/sim/tuning'
import type { MarbleSim } from '../../systems/sim/MarbleSim'
import { useGameStore } from '../../store/useGameStore'

export type FxEvent = { type: 'land' | 'impact'; x: number; y: number; z: number; strength: number }

// sim → particle-component channel (set on mount; boot()'s sim events call dispatchFx).
const fxListeners = new WeakMap<MarbleSim, (e: FxEvent) => void>()
export function dispatchFx(sim: MarbleSim, e: FxEvent): void {
    fxListeners.get(sim)?.(e)
}

const TRAIL_COLOR: [number, number, number] = [0.18, 0.85, 0.65] // teal, matches the ball
const LAND_COLOR: [number, number, number] = [1.0, 0.9, 0.7]     // warm dust
const IMPACT_COLOR: [number, number, number] = [1.0, 0.65, 0.3]  // spark
const ENEMY_TRAIL_COLOR: [number, number, number] = [1.0, 0.28, 0.2]  // red roll-trail, matches the enemy
const GROUND_MARK_COLOR: [number, number, number] = [1.0, 0.35, 0.12] // ember breadcrumb left on the ground

// Render layer that the ball reflection CubeCameras do NOT render (they stay on the default
// layer 0). Particles live here so the marble reflection doesn't pick up the flickering additive
// Points. The MAIN camera enables this layer (see Box3DScene) so they're still visible normally.
export const REFLECTION_EXCLUDE_LAYER = 2

type Props = {
    sim: MarbleSim
    playerPosRef: React.MutableRefObject<THREE.Vector3>
    enemyPosRef: React.MutableRefObject<THREE.Vector3>
    /** Sim time-scale (1 live, 0 paused, <1 during replay slow-mo). Scales particle dt so trails
        freeze on pause and dilate in slow-mo instead of running at real time. */
    timeScaleRef?: React.MutableRefObject<number>
}

export function Box3DParticles({ sim, playerPosRef, enemyPosRef, timeScaleRef }: Props) {
    const particles = useMemo(() => new ParticleSystem(800, 0.3), [])
    // Separate pooled system (its own single draw call) for the enemy's persistent ground
    // breadcrumb — long-lived, ground-pinned marks, tuned independently from the airborne dust.
    const groundTrail = useMemo(() => new ParticleSystem(400, 0.6), [])
    const trailClock = useRef(0)
    const enemyTrailClock = useRef(0)
    // Last position where we dropped a breadcrumb (null = not yet seeded this round).
    const lastMark = useRef<{ x: number; z: number } | null>(null)
    const gameState = useGameStore(s => s.gameState)

    // Route the sim's cosmetic events into particle bursts.
    useEffect(() => {
        const handler = (e: FxEvent) => {
            if (e.type === 'land') {
                const n = Math.min(24, Math.round(e.strength * 2))
                particles.emitBurst(e.x, e.y - PLAYER.radius * 0.8, e.z, {
                    count: n, speed: 1.2 + e.strength * 0.35, spread: 1.4, up: 0.35,
                    life: 0.5, gravity: -10, color: LAND_COLOR
                })
            } else {
                const n = Math.min(24, Math.round(e.strength * 1.8))
                particles.emitBurst(e.x, e.y, e.z, {
                    count: n, speed: 1.5 + e.strength * 0.5, spread: 1.2, up: 0.5,
                    life: 0.45, gravity: -9, color: IMPACT_COLOR
                })
            }
        }
        fxListeners.set(sim, handler)
        return () => { fxListeners.delete(sim) }
    }, [sim, particles])

    // Clear particles + ground breadcrumbs on round reset.
    useEffect(() => {
        if (gameState === 'setup' || gameState === 'countdown') {
            particles.clear()
            groundTrail.clear()
            lastMark.current = null
        }
    }, [gameState, particles, groundTrail])

    useEffect(() => () => { particles.dispose(); groundTrail.dispose() }, [particles, groundTrail])

    // Move both Points systems off the default layer so the ball reflection CubeCameras skip them
    // (the main camera re-enables this layer — see Box3DScene). Kills the reflection flicker.
    useEffect(() => {
        particles.points.layers.set(REFLECTION_EXCLUDE_LAYER)
        groundTrail.points.layers.set(REFLECTION_EXCLUDE_LAYER)
    }, [particles, groundTrail])

    useFrame((_, delta) => {
        // Scale by sim time so particles pause when the sim is paused and go slow-mo with it.
        const dt = Math.min(delta, 0.05) * (timeScaleRef?.current ?? 1)
        if (dt <= 0) return

        // Roll trails: rate scales with speed, only while grounded and moving.
        const speed = Math.hypot(sim.playerVel.x, sim.playerVel.z)
        if (sim.playerGrounded && speed > FX.trailMinSpeed) {
            trailClock.current += dt
            const interval = Math.max(0.02, 0.05 * (FX.trailMinSpeed / speed))
            let guard = 0
            while (trailClock.current > interval && guard++ < 6) {
                trailClock.current -= interval
                const p = playerPosRef.current
                particles.emitTrail(p.x, p.y - PLAYER.radius * 0.7, p.z, {
                    vx: sim.playerVel.x, vz: sim.playerVel.z, life: 0.45, color: TRAIL_COLOR
                })
            }
        } else {
            trailClock.current = 0
        }

        // Enemy roll trail (red) — mirrors the player trail, read from the sim's enemy telemetry.
        const eSpeed = Math.hypot(sim.enemyVel.x, sim.enemyVel.z)
        if (sim.enemyGrounded && eSpeed > FX.trailMinSpeed) {
            enemyTrailClock.current += dt
            const interval = Math.max(0.02, 0.05 * (FX.trailMinSpeed / eSpeed))
            let guard = 0
            const ep = enemyPosRef.current
            while (enemyTrailClock.current > interval && guard++ < 6) {
                enemyTrailClock.current -= interval
                particles.emitTrail(ep.x, ep.y - sim.enemySize * 0.7, ep.z, {
                    vx: sim.enemyVel.x, vz: sim.enemyVel.z, life: 0.5, color: ENEMY_TRAIL_COLOR
                })
            }
        } else {
            enemyTrailClock.current = 0
        }

        // Enemy ground breadcrumb: while the round is live and the enemy is on the ground,
        // drop a slowly-fading mark at its contact point every FX.enemyTrailSpacing of travel,
        // so you can read the path it took ("the enemy was here"). Contact height comes from
        // the enemy's own render Y minus its radius — no dependency on the terrain formula, and
        // it naturally rides up onto cube tops.
        if (gameState === 'playing' && sim.enemyGrounded) {
            const ep = enemyPosRef.current
            if (lastMark.current === null) {
                lastMark.current = { x: ep.x, z: ep.z }
            } else if (Math.hypot(ep.x - lastMark.current.x, ep.z - lastMark.current.z) >= FX.enemyTrailSpacing) {
                lastMark.current.x = ep.x
                lastMark.current.z = ep.z
                groundTrail.emit(ep.x, ep.y - sim.enemySize + 0.05, ep.z, 0, 0, 0, FX.enemyTrailLife, 0, GROUND_MARK_COLOR)
            }
        } else if (gameState !== 'playing') {
            lastMark.current = null
        }

        particles.update(dt)
        groundTrail.update(dt)
    })

    return (
        <>
            <primitive object={particles.points} />
            <primitive object={groundTrail.points} />
        </>
    )
}
