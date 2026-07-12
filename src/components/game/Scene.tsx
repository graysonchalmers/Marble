import React, { useRef, useEffect, useState, useMemo } from 'react'
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { Canvas, useFrame } from '@react-three/fiber'
import { Physics } from '@react-three/cannon'
import { Environment, Text, GradientTexture } from '@react-three/drei'
import { Level } from './Level'
import { PlayerSphere } from './PlayerSphere'
import { EnemySphereV2 } from './EnemySphereV2'
import { VectorIndicator } from './VectorIndicator'
import { CameraOcclusion } from './CameraOcclusion'
import { useGameStore } from '../../store/useGameStore'
import { soundManager } from '../../audio/SoundManager'
import { GameLoop } from '../../engine/loop'
import { rulesSystem } from '../../systems/rules/RulesSystem'
import { SonarSystem } from '../../systems/sonar/SonarSystem'

// Shared variables for instrumentation
let lastSimMs = 0
let lastRenderMs = 0

// Logic component that drives the game loop and sound listener inside Canvas
function GameLoopDriver({ playerPos, enemyPos, setShowGo }: {
    playerPos: React.MutableRefObject<THREE.Vector3>,
    enemyPos: React.MutableRefObject<THREE.Vector3>,
    setShowGo: React.Dispatch<React.SetStateAction<boolean>>
}) {
    const gameState = useGameStore(s => s.gameState)
    const isPaused = useGameStore(s => s.isPaused)

    // Instantiate systems once
    const loop = useMemo(() => new GameLoop({ simRate: 60 }), [])
    const sonarSystem = useMemo(() => new SonarSystem(playerPos, enemyPos), [playerPos, enemyPos])

    // Register ticks once
    useEffect(() => {
        const tickRules = (dt: number) => rulesSystem.tick(dt)
        const tickSonar = (dt: number) => sonarSystem.tick(dt)

        loop.addTick(tickRules)
        loop.addTick(tickSonar)

        return () => {
            loop.removeTick(tickRules)
            loop.removeTick(tickSonar)
            loop.stop()
        }
    }, [loop, sonarSystem])

    // Manage Sonar start/stop reactively
    useEffect(() => {
        if (gameState === 'playing' && !isPaused) {
            soundManager.startSonar()
        } else {
            soundManager.stopSonar()
        }
        return () => soundManager.stopSonar()
    }, [gameState, isPaused])

    // Monitor transition from countdown to playing to show the "GO!" text
    const lastStateRef = useRef(gameState)
    useEffect(() => {
        if (lastStateRef.current === 'countdown' && gameState === 'playing') {
            setShowGo(true)
            const timer = setTimeout(() => setShowGo(false), 1000)
            return () => clearTimeout(timer)
        }
        lastStateRef.current = gameState
    }, [gameState, setShowGo])

    // Reset loop state when countdown or setup triggers
    useEffect(() => {
        if (gameState === 'setup' || gameState === 'countdown') {
            loop.reset()
            rulesSystem.reset()
            sonarSystem.reset()
        }
    }, [gameState, loop, sonarSystem])

    useFrame((state, delta) => {
        // Tick fixed game loop systems
        const start = performance.now()
        loop.advance(delta)
        lastSimMs = performance.now() - start

        // Update audio listener position/orientation
        if (gameState === 'playing') {
            soundManager.updateListener(state.camera)
        }
    })

    return null
}

function PerfBridge() {
    const fpsSamples = useRef<number[]>([])

    useFrame((state, delta) => {
        if (delta > 0) {
            const currentFps = 1 / delta
            fpsSamples.current.push(currentFps)
            if (fpsSamples.current.length > 30) {
                fpsSamples.current.shift()
            }
        }

        // Update store occasionally (every 0.5s)
        if (state.clock.elapsedTime % 0.5 < 0.02 && fpsSamples.current.length > 0) {
            const avgFps = fpsSamples.current.reduce((a, b) => a + b, 0) / fpsSamples.current.length
            const gl = state.gl
            
            // Safe JS Heap check (Chrome only)
            const mem = (performance as any).memory ? (performance as any).memory.usedJSHeapSize / (1024 * 1024) : 0
            
            useGameStore.setState({
                perfStats: {
                    fps: Math.round(avgFps),
                    simMs: parseFloat(lastSimMs.toFixed(2)),
                    renderMs: parseFloat(lastRenderMs.toFixed(2)),
                    drawCalls: gl.info.render.calls,
                    triangles: gl.info.render.triangles,
                    geometries: gl.info.memory.geometries,
                    textures: gl.info.memory.textures,
                    memory: Math.round(mem * 10) / 10
                }
            })
        }
    })
    return null
}

function SceneInner() {
    const isPaused = useGameStore(s => s.isPaused)
    const gameState = useGameStore(s => s.gameState)
    const setGameState = useGameStore(s => s.setGameState)
    const countdownValue = useGameStore(s => s.countdownValue)
    const gravity = useGameStore(s => s.gravity)
    const friction = useGameStore(s => s.friction)
    const restitution = useGameStore(s => s.restitution)
    const worldScale = useGameStore(s => s.worldScale)
    const physicsRate = useGameStore(s => s.physicsRate)
    const shadowsEnabled = useGameStore(s => s.shadowsEnabled)
    const pixelRatio = useGameStore(s => s.pixelRatio)
    const enemySize = useGameStore(s => s.enemySize)
    const enemyMass = useGameStore(s => s.enemyMass)

    // Initialize with spawn positions to prevent immediate collision
    const playerPosRef = useRef(new THREE.Vector3(0, 5, 0))
    const enemyPosRef = useRef(new THREE.Vector3(0, 20, -15))

    const [showGo, setShowGo] = useState(false)

    // Countdown Logic (only for start to setup transition)
    useEffect(() => {
        if (gameState === 'start') {
            setGameState('setup')
        }
    }, [gameState, setGameState])

    // Memoize physics props to prevent world reset
    // World Scale affects gravity: higher scale = stronger gravity (snappy/toy), lower = weaker (heavy/giant)
    const gravityVec = useMemo<[number, number, number]>(() => [0, gravity * worldScale, 0], [gravity, worldScale])
    const contactMat = useMemo(() => ({ friction, restitution }), [friction, restitution])

    return (
        <Canvas 
            shadows={shadowsEnabled} 
            dpr={pixelRatio} 
            camera={{ position: [0, 5, 10], fov: 50 }}
            gl={async (props) => {
                let renderer;
                try {
                    renderer = new WebGPURenderer({ 
                        canvas: props.canvas as any, 
                        antialias: false, 
                        powerPreference: 'high-performance' 
                    })
                    await renderer.init()
                } catch (e) {
                    console.warn('WebGPURenderer failed to initialize, falling back to WebGLRenderer:', e)
                    renderer = new THREE.WebGLRenderer({
                        canvas: props.canvas,
                        antialias: false,
                        powerPreference: 'high-performance'
                    })
                }

                // Override render function to measure CPU render time
                const originalRender = renderer.render;
                renderer.render = function(scene: any, camera: any) {
                    const start = performance.now()
                    originalRender.call(this, scene, camera)
                    lastRenderMs = performance.now() - start
                }

                return renderer
            }}
        >
            <GameLoopDriver playerPos={playerPosRef} enemyPos={enemyPosRef} setShowGo={setShowGo} />
            <PerfBridge />
            {/* Visuals */}

            {/* Sky Gradient */}
            <mesh>
                <sphereGeometry args={[100, 32, 32]} />
                <meshBasicMaterial side={THREE.BackSide}>
                    <GradientTexture
                        stops={[0, 1]}
                        colors={['#7bb0ff', '#dceeff']} // Soft blue sky to light fog
                        size={1024}
                    />
                </meshBasicMaterial>
            </mesh>
            <fog attach="fog" args={['#dceeff', 20, 90]} />

            <Environment preset="night" />


            <ambientLight intensity={0.5} />
            <pointLight position={[-10, 10, -10]} intensity={0.5} />

            {/* Countdown / GO Text */}
            {(gameState === 'countdown' || showGo) && (
                <group position={[0, 8, -5]} quaternion={[0, 0, 0, 1]}>
                    <Text
                        color={showGo ? "#ffffff" : "#ffffff"}
                        fontSize={showGo ? 4 : 3}
                        position={[0, 10, 0]}
                        anchorX="center"
                        anchorY="middle"
                        outlineWidth={0.1}
                        outlineColor="#000000"
                    >
                        {showGo ? "GO!" : countdownValue}
                    </Text>
                </group>
            )}

            {/* Physics World */}
            <Physics
                gravity={gravityVec}
                stepSize={1 / physicsRate}
                isPaused={isPaused || gameState === 'gameover'}
                defaultContactMaterial={contactMat}
                iterations={20}
                broadphase="SAP"
            >
                <Level />
                {/* Only render players/physics when not in start mode, but we can render them always, just paused? */}
                {/* Actually, if we spawn them, they might fall if physics is running. */}
                {/* Let's keep physics running for countdown so they settle, but enemy shouldn't move. */}
                <PlayerSphere positionRef={playerPosRef} />
                <EnemySphereV2
                    key={`enemy-v2-${enemySize}-${enemyMass}`}
                    playerPos={playerPosRef}
                    positionRef={enemyPosRef}
                />
            </Physics>

            <VectorIndicator playerPos={playerPosRef} enemyPos={enemyPosRef} />
            <CameraOcclusion playerPos={playerPosRef} />

        </Canvas>
    )
}

export const Scene = React.memo(SceneInner)
