/**
 * components/game-beta/AIDebugOverlay.tsx — Debug / Dev-Tools: AI legibility overlay.
 *
 * Makes the enemy's "mind" visible so its vision + hunt behaviour can be tuned and new search
 * patterns designed against something you can see (docs/PLAN.md → Debug / Dev-Tools Backlog).
 * Reads the render-only `sim.enemyDebug` snapshot (refreshed each 10Hz AI tick) plus the live
 * interpolated enemy/player render positions. Pure visualisation — it never touches the sim, draws
 * no RNG, and is only mounted when the `debugAI` toggle is on, so it's F9-safe by construction.
 *
 * Layers: vision range ring · line-of-sight ray (green = sees you / red = blocked by cover) ·
 * last-known-player marker · movement-target marker · search waypoints + path (search state only) ·
 * obstacle-avoidance probe · belief heat (belief search on: brighter = where the enemy thinks you are; the
 * spiral waypoints are hidden then, since they no longer steer).
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { MutableRefObject } from 'react'
import type { MarbleSim } from '../../systems/sim/MarbleSim'
import { AI_DEBUG } from '../../systems/sim/tuning'
import { useGameStore } from '../../store/useGameStore'
import { getTerrainHeight } from '../../utils/terrain'
import { cellX, cellZ } from '../../systems/ai/beliefSearch'

interface AIDebugOverlayProps {
    sim: MarbleSim
    playerPosRef: MutableRefObject<THREE.Vector3>
    enemyPosRef: MutableRefObject<THREE.Vector3>
}

const GROUND_Y = 0.12   // lift lines/rings just off the floor so they don't z-fight the terrain

export function AIDebugOverlay({ sim, playerPosRef, enemyPosRef }: AIDebugOverlayProps) {
    const objs = useMemo(() => {
        const line = (color: string, dashed = false) => {
            const geo = new THREE.BufferGeometry()
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
            const mat = dashed
                ? new THREE.LineDashedMaterial({ color, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.9 })
                : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
            return new THREE.Line(geo, mat)
        }
        const marker = (color: string, radius: number) =>
            new THREE.Mesh(
                new THREE.SphereGeometry(radius, 16, 12),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
            )

        const vd = sim.enemyDebug.visionDistance
        const visionRing = new THREE.Mesh(
            new THREE.RingGeometry(Math.max(0, vd - 0.2), vd + 0.2, 72),
            new THREE.MeshBasicMaterial({ color: AI_DEBUG.visionRing, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
        )
        visionRing.rotation.x = -Math.PI / 2

        const los = line(AI_DEBUG.losClear)
        const avoid = line(AI_DEBUG.avoid)
        const searchPath = line(AI_DEBUG.waypoint, true)
        searchPath.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3))

        const lastKnown = marker(AI_DEBUG.lastKnown, 0.45)
        const target = marker(AI_DEBUG.target, 0.4)
        const waypoints = [0, 1, 2, 3].map(() => marker(AI_DEBUG.waypoint, 0.3))

        return { visionRing, los, avoid, searchPath, lastKnown, target, waypoints }
    }, [sim])

    // Belief heat: one flat square per grid cell, built the first time the sim has a belief grid.
    const groupRef = useRef<THREE.Group>(null)
    const heatRef = useRef<{ mesh: THREE.InstancedMesh | null; color: THREE.Color }>({ mesh: null, color: new THREE.Color() })
    useEffect(() => {
        const heat = heatRef.current
        return () => { heat.mesh?.geometry.dispose(); (heat.mesh?.material as THREE.Material | undefined)?.dispose() }
    }, [])

    useFrame(() => {
        const dbg = sim.enemyDebug
        const g = sim.beliefGrid
        const beliefOn = !!g && useGameStore.getState().beliefSearch
        const heat = heatRef.current
        if (beliefOn && g && !heat.mesh && groupRef.current) {
            const n = g.cols * g.rows
            const geo = new THREE.PlaneGeometry(g.cell * 0.9, g.cell * 0.9).rotateX(-Math.PI / 2)
            const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
            const mesh = new THREE.InstancedMesh(geo, mat, n)
            const m = new THREE.Matrix4()
            for (let i = 0; i < n; i++) {
                const x = cellX(g, i), z = cellZ(g, i)
                mesh.setMatrixAt(i, m.makeTranslation(x, (sim.hasTerrain ? getTerrainHeight(x, z) : 0.5) + GROUND_Y + 0.05, z))
                mesh.setColorAt(i, heat.color.setRGB(0, 0, 0))
            }
            mesh.frustumCulled = false
            groupRef.current.add(mesh)
            heat.mesh = mesh
        }
        if (heat.mesh) heat.mesh.visible = beliefOn && dbg.active
        if (heat.mesh?.visible && g) {
            let max = 0
            for (let i = 0; i < g.belief.length; i++) if (g.belief[i] > max) max = g.belief[i]
            for (let i = 0; i < g.belief.length; i++) {
                const v = max > 0 ? Math.sqrt(g.belief[i] / max) : 0
                heat.mesh.setColorAt(i, heat.color.setRGB(v, 0.35 * v, 0.05 * v))
            }
            heat.mesh.instanceColor!.needsUpdate = true
        }
        const e = enemyPosRef.current
        const p = playerPosRef.current
        const visible = dbg.active
        objs.visionRing.visible = visible
        objs.los.visible = visible
        objs.avoid.visible = visible && dbg.avoidActive
        objs.lastKnown.visible = visible
        objs.target.visible = visible
        const searching = dbg.state === 'search' && !beliefOn
        objs.searchPath.visible = visible && searching
        objs.waypoints.forEach(w => (w.visible = visible && searching))
        if (!visible) return

        // Vision range ring — centred on the enemy.
        objs.visionRing.position.set(e.x, GROUND_Y, e.z)

        // Line of sight enemy → player, coloured by whether the enemy can currently see the player.
        const lp = objs.los.geometry.getAttribute('position') as THREE.BufferAttribute
        lp.setXYZ(0, e.x, e.y, e.z)
        lp.setXYZ(1, p.x, p.y, p.z)
        lp.needsUpdate = true
        ;(objs.los.material as THREE.LineBasicMaterial).color.set(dbg.canSee ? AI_DEBUG.losClear : AI_DEBUG.losBlocked)

        // Last-known-player + current movement target markers.
        objs.lastKnown.position.set(dbg.lastKnown.x, dbg.lastKnown.y + 0.5, dbg.lastKnown.z)
        objs.target.position.set(dbg.target.x, dbg.target.y + 0.5, dbg.target.z)

        // Search waypoints + the path through them (the visible "hunting pattern").
        if (searching) {
            const sp = objs.searchPath.geometry.getAttribute('position') as THREE.BufferAttribute
            for (let i = 0; i < 4; i++) {
                const w = dbg.waypoints[i]
                objs.waypoints[i].position.set(w.x, GROUND_Y, w.z)
                const active = i === dbg.waypointIndex
                objs.waypoints[i].scale.setScalar(active ? 1.6 : 1)
                ;(objs.waypoints[i].material as THREE.MeshBasicMaterial).color.set(active ? AI_DEBUG.waypointActive : AI_DEBUG.waypoint)
                sp.setXYZ(i, w.x, GROUND_Y, w.z)
            }
            sp.needsUpdate = true
            objs.searchPath.computeLineDistances()
        }

        // Obstacle-avoidance probe — from the enemy along the checked travel direction.
        if (dbg.avoidActive) {
            const ap = objs.avoid.geometry.getAttribute('position') as THREE.BufferAttribute
            ap.setXYZ(0, e.x, e.y, e.z)
            ap.setXYZ(1, e.x + dbg.probeDir.x * dbg.probeLen, e.y, e.z + dbg.probeDir.z * dbg.probeLen)
            ap.needsUpdate = true
        }
    })

    return (
        <group ref={groupRef}>
            <primitive object={objs.visionRing} />
            <primitive object={objs.los} />
            <primitive object={objs.avoid} />
            <primitive object={objs.searchPath} />
            <primitive object={objs.lastKnown} />
            <primitive object={objs.target} />
            {objs.waypoints.map((w, i) => <primitive key={i} object={w} />)}
        </group>
    )
}
