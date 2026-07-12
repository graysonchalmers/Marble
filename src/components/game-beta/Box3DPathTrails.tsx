/**
 * Box3DPathTrails.tsx — fading ground path lines.
 *
 * Draws a growing polyline tracing where the player (teal) and enemy (red) have been, hugging the
 * ground at each ball's contact point. Each point holds full brightness for FULL_LIFE seconds then
 * fades to nothing over FADE_LIFE — so the path lasts "a while" and then clears itself instead of
 * living forever. The fade rides sim time (timeScaleRef): it freezes on pause and slows with the
 * replay slow-mo, matching the particles.
 *
 * Implementation: additive `THREE.Line` with per-vertex colors. Fading = scaling a point's RGB
 * toward black (additive → black adds nothing → invisible), so no custom shader is needed. Fully
 * faded points are culled from the front (head advances); the buffer compacts if a very long round
 * overruns MAX_POINTS. Render-only — never feeds back into the sim.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PLAYER } from '../../systems/sim/tuning'
import type { MarbleSim } from '../../systems/sim/MarbleSim'
import { useGameStore } from '../../store/useGameStore'
import { useReplayStore } from '../../state/replayStore'

const MAX_POINTS = 4000
const SPACING = 0.35      // min horizontal travel (u) between recorded path points
const GROUND_LIFT = 0.06  // raise slightly above the contact point to avoid z-fighting
const FULL_LIFE = 6       // seconds a point stays at full brightness
const FADE_LIFE = 8       // seconds it then takes to fade to nothing
const TOTAL_LIFE = FULL_LIFE + FADE_LIFE
const PLAYER_COLOR: [number, number, number] = [0.16, 0.84, 0.64] // teal, matches the ball
const ENEMY_COLOR: [number, number, number] = [1.0, 0.30, 0.22]   // red, matches the enemy

type LineBundle = {
    line: THREE.Line
    positions: Float32Array
    colors: Float32Array
    birth: Float32Array
    posAttr: THREE.BufferAttribute
    colAttr: THREE.BufferAttribute
    base: [number, number, number]
    head: number
    count: number
    last: THREE.Vector3 | null
}

function makeLine(base: [number, number, number]): LineBundle {
    const geom = new THREE.BufferGeometry()
    const positions = new Float32Array(MAX_POINTS * 3)
    const colors = new Float32Array(MAX_POINTS * 3)
    const birth = new Float32Array(MAX_POINTS)
    const posAttr = new THREE.BufferAttribute(positions, 3)
    const colAttr = new THREE.BufferAttribute(colors, 3)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    colAttr.setUsage(THREE.DynamicDrawUsage)
    geom.setAttribute('position', posAttr)
    geom.setAttribute('color', colAttr)
    geom.setDrawRange(0, 0)
    const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    })
    const line = new THREE.Line(geom, mat)
    line.frustumCulled = false
    return { line, positions, colors, birth, posAttr, colAttr, base, head: 0, count: 0, last: null }
}

function resetBundle(b: LineBundle) {
    b.head = 0
    b.count = 0
    b.last = null
    b.line.geometry.setDrawRange(0, 0)
}

function compact(b: LineBundle) {
    const n = b.count - b.head
    b.positions.copyWithin(0, b.head * 3, b.count * 3)
    b.colors.copyWithin(0, b.head * 3, b.count * 3)
    b.birth.copyWithin(0, b.head, b.count)
    b.head = 0
    b.count = n
}

function updateBundle(b: LineBundle, center: THREE.Vector3, radius: number, clock: number) {
    // Append a new point once the ball has travelled SPACING horizontally.
    const x = center.x
    const y = center.y - radius + GROUND_LIFT
    const z = center.z
    if (b.last === null || Math.hypot(x - b.last.x, z - b.last.z) >= SPACING) {
        if (b.count >= MAX_POINTS) compact(b)
        if (b.count < MAX_POINTS) {
            const i = b.count
            b.positions[i * 3] = x
            b.positions[i * 3 + 1] = y
            b.positions[i * 3 + 2] = z
            b.birth[i] = clock
            b.count++
            if (b.last === null) b.last = new THREE.Vector3(x, y, z)
            else b.last.set(x, y, z)
        }
    }

    // Cull fully-faded points from the front (birth is monotonic with index).
    while (b.head < b.count && clock - b.birth[b.head] >= TOTAL_LIFE) b.head++

    // Recolor the active range by age → alpha (baked into RGB; additive fades to invisible).
    for (let i = b.head; i < b.count; i++) {
        const age = clock - b.birth[i]
        const a = age <= FULL_LIFE ? 1 : Math.max(0, 1 - (age - FULL_LIFE) / FADE_LIFE)
        b.colors[i * 3] = b.base[0] * a
        b.colors[i * 3 + 1] = b.base[1] * a
        b.colors[i * 3 + 2] = b.base[2] * a
    }

    const n = b.count - b.head
    b.line.geometry.setDrawRange(b.head, n >= 2 ? n : 0)
    b.posAttr.needsUpdate = true
    b.colAttr.needsUpdate = true
}

type Props = {
    sim: MarbleSim
    playerPosRef: React.MutableRefObject<THREE.Vector3>
    enemyPosRef: React.MutableRefObject<THREE.Vector3>
    /** Sim time-scale (1 live, 0 paused, <1 slow-mo) — the fade clock advances by dt·scale. */
    timeScaleRef?: React.MutableRefObject<number>
}

export function Box3DPathTrails({ sim, playerPosRef, enemyPosRef, timeScaleRef }: Props) {
    const player = useMemo(() => makeLine(PLAYER_COLOR), [])
    const enemy = useMemo(() => makeLine(ENEMY_COLOR), [])
    const clockRef = useRef(0)
    const gameState = useGameStore(s => s.gameState)
    const isReplaying = useReplayStore(s => s.isReplaying)

    // Reset both paths at the start of a new round.
    useEffect(() => {
        if (gameState === 'setup' || gameState === 'countdown') {
            resetBundle(player)
            resetBundle(enemy)
        }
    }, [gameState, player, enemy])

    useEffect(() => () => {
        player.line.geometry.dispose()
        ;(player.line.material as THREE.Material).dispose()
        enemy.line.geometry.dispose()
        ;(enemy.line.material as THREE.Material).dispose()
    }, [player, enemy])

    useFrame((_, delta) => {
        // Record during live play AND replay (so the path redraws as the replay runs).
        if (gameState !== 'playing' && !isReplaying) return
        clockRef.current += Math.min(delta, 0.05) * (timeScaleRef?.current ?? 1)
        const clock = clockRef.current
        updateBundle(player, playerPosRef.current, PLAYER.radius, clock)
        updateBundle(enemy, enemyPosRef.current, sim.enemySize, clock)
    })

    return (
        <>
            <primitive object={player.line} />
            <primitive object={enemy.line} />
        </>
    )
}
