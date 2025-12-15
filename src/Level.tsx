import { useHeightfield, useBox } from '@react-three/cannon'
import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'

// Terrain generation parameters
const WIDTH = 64
const DEPTH = 64
const SCALE = 2

// Function to generate consistent terrain data
function generateTerrainData() {
    const data = [] // data[x][z]

    // Initialize data array
    for (let x = 0; x < WIDTH; x++) {
        data.push(new Array(DEPTH).fill(0))
    }

    const visualHeights = []

    // PlaneGeometry iterates:
    // Rows (Y) from +Y (Top) to -Y (Bottom).
    // Cols (X) from -X (Left) to +X (Right).
    //
    // Rotated -90 X:
    // Local +Y -> World -Z (Back).
    // Local -Y -> World +Z (Front).
    // Local -X -> World -X (Left).
    // Local +X -> World +X (Right).
    //
    // So Plane generation starts at Back-Left (World -X, -Z) and goes to Right, then moves Front.
    //
    // Physics Heightfield Origin (0,0) is usually at corner.
    // Let's assume Origin is Back-Left (-X, -Z).
    // Then X grows Right. Z grows Front.
    //
    // So Z loop (0 to DEPTH) = Back to Front.
    // X loop (0 to WIDTH) = Left to Right.
    // This matches PlaneGeometry order perfectly.

    for (let z = 0; z < DEPTH; z++) {
        for (let x = 0; x < WIDTH; x++) {
            // Normalize coords
            const xn = x / WIDTH * 5
            const zn = z / DEPTH * 5

            // Hillier terrain
            const y = Math.sin(xn * 1.5) * Math.cos(zn * 1.5) * 2.5 + Math.sin(xn * 4 + zn * 2) * 0.8

            // Store for physics (x, z)
            data[x][z] = y

            // Store for visual (row-major: Z outer, X inner)
            visualHeights.push(y)
        }
    }

    return { data, visualHeights }
}

import { useSettings } from './SettingsContext'


function useGridTexture(colorBg: string, colorGrid: string, gridStep: number = 64) {
    return useMemo(() => {
        const RES = 2048 // High res for "vector-like" sharp lines
        const canvas = document.createElement('canvas')
        canvas.width = RES
        canvas.height = RES
        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.fillStyle = colorBg
            ctx.fillRect(0, 0, RES, RES)

            // Snap gridStep to nearest clean divisor of 512 (base size) for perfect tiling
            const numCells = Math.round(512 / gridStep)
            const adjustedGridStep = 512 / Math.max(1, numCells)

            const scale = RES / 512
            const scaledStep = adjustedGridStep * scale
            const scaledMinorStep = scaledStep / 2

            // Draw Minor Lines (Subtle)
            ctx.beginPath()
            ctx.strokeStyle = colorGrid
            ctx.globalAlpha = 0.3 // Subtle
            ctx.lineWidth = 2 * scale // Thicker in pixels, same relative visual weight

            for (let i = 0; i <= RES; i += scaledMinorStep) {
                if (i % scaledStep !== 0) { // Don't draw over major lines
                    ctx.moveTo(i, 0); ctx.lineTo(i, RES)
                    ctx.moveTo(0, i); ctx.lineTo(RES, i)
                }
            }
            ctx.stroke()

            // Draw Major Lines (Strong)
            ctx.beginPath()
            ctx.globalAlpha = 1.0
            ctx.lineWidth = 4 * scale // Stronger lines
            for (let i = 0; i <= RES; i += scaledStep) {
                ctx.moveTo(i, 0); ctx.lineTo(i, RES)
                ctx.moveTo(0, i); ctx.lineTo(RES, i)
            }
            ctx.stroke()
        }
        const tex = new THREE.CanvasTexture(canvas)
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.RepeatWrapping
        // Max anisotropy for sharp angles
        tex.anisotropy = 16
        return tex
    }, [colorBg, colorGrid, gridStep])
}

function FallingCubes() {
    const { cubeCount, cubeScale, cubeGridSize, cubeColorBg, cubeColorGrid } = useSettings()
    return <FallingCubesInner key={`${cubeCount}-${cubeScale}`} count={cubeCount} scale={cubeScale} gridSize={cubeGridSize} colorBg={cubeColorBg} colorGrid={cubeColorGrid} />
}

const FallingCubesInner = React.memo(({ count, scale, gridSize, colorBg, colorGrid }: { count: number, scale: number, gridSize: number, colorBg: string, colorGrid: string }) => {
    // CRITICAL FIX: Memoize initial spawn positions to prevent physics reset on re-render
    // Without this, Math.random() in useBox generates new positions each time, 
    // causing cubes to "jump" when transitioning from setup to countdown/playing
    const initialTransforms = useMemo(() => {
        const transforms: { position: [number, number, number], rotation: [number, number, number] }[] = []
        for (let i = 0; i < count; i++) {
            let x, z
            do {
                x = (Math.random() - 0.5) * WIDTH * SCALE * 0.8
                z = (Math.random() - 0.5) * DEPTH * SCALE * 0.8
            } while (x * x + z * z < 20 * 20) // Clear radius of 20
            transforms.push({
                position: [x, 2 + Math.random() * 5, z], // Lower drop height (was 5-10, now 2-7)
                rotation: [Math.random() * Math.PI, Math.random() * Math.PI, 0]
            })
        }
        return transforms
    }, [count]) // Only regenerate when count changes

    const [ref] = useBox((index) => ({
        mass: 10, // Heavier (was 1) to settle quicker and be more solid
        allowSleep: true,
        sleepSpeedLimit: 1.0, // Increased sleep threshold to let them settle faster
        sleepTimeLimit: 0.1,
        position: initialTransforms[index].position,
        rotation: initialTransforms[index].rotation,
        args: [scale, scale, scale]
    }), useRef<THREE.InstancedMesh>(null), [initialTransforms, scale])

    // Gray Grid for Cubes (Light Background, Dark Grid)
    const texture = useGridTexture(colorBg, colorGrid, gridSize)

    return (
        <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow userData={{ isObstacle: true }}>
            <boxGeometry args={[scale, scale, scale]} />
            <meshStandardMaterial map={texture} />
        </instancedMesh>
    )
})

function BoundaryWalls() {
    const width = WIDTH * SCALE
    const depth = DEPTH * SCALE
    const height = 50
    const thickness = 5
    const halfWidth = width / 2
    const halfDepth = depth / 2

    // Left (-X)
    useBox(() => ({ type: 'Static', position: [-halfWidth, height / 2 - 10, 0], args: [thickness, height, depth] }))
    // Right (+X)
    useBox(() => ({ type: 'Static', position: [halfWidth, height / 2 - 10, 0], args: [thickness, height, depth] }))
    // Back (-Z)
    useBox(() => ({ type: 'Static', position: [0, height / 2 - 10, -halfDepth], args: [width, height, thickness] }))
    // Front (+Z)
    useBox(() => ({ type: 'Static', position: [0, height / 2 - 10, halfDepth], args: [width, height, thickness] }))

    return null
}

function Terrain() {
    const { groundGridSize, groundColorBg, groundColorGrid } = useSettings()
    const { data, visualHeights } = useMemo(() => generateTerrainData(), [])

    // 1. Physics Body (Invisible)
    const physicsData = useMemo(() => data.map(row => [...row].reverse()), [data])

    // Position: Top-Left corner of the area.
    useHeightfield(() => ({
        args: [physicsData, { elementSize: SCALE }],
        position: [-(WIDTH * SCALE) / 2, 0, (DEPTH * SCALE) / 2],
        rotation: [-Math.PI / 2, 0, 0]
    }))

    // 2. Visual Mesh
    const geom = useMemo(() => {
        const geometry = new THREE.PlaneGeometry(WIDTH * SCALE, DEPTH * SCALE, WIDTH - 1, DEPTH - 1)
        const posAttribute = geometry.attributes.position

        for (let i = 0; i < posAttribute.count; i++) {
            posAttribute.setZ(i, visualHeights[i])
        }

        geometry.computeVertexNormals()
        return geometry
    }, [visualHeights])

    // Green Grid for Terrain
    // Background: Lighter Grass Green, Grid: Darker Green
    const gridTexture = useGridTexture(groundColorBg, groundColorGrid, groundGridSize)
    gridTexture.repeat.set(WIDTH / 8, DEPTH / 8)

    return (
        <mesh receiveShadow geometry={geom} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} userData={{ isGround: true }}>
            <meshStandardMaterial map={gridTexture} roughness={0.8} metalness={0.1} />
        </mesh>
    )
}

export function Level() {
    return (
        <>
            <Terrain />
            <BoundaryWalls />
            <FallingCubes />
        </>
    )
}
