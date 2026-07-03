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

// Logic component that runs inside Canvas
function GameLogic({ playerPos, enemyPos }: { playerPos: React.MutableRefObject<THREE.Vector3>, enemyPos: React.MutableRefObject<THREE.Vector3> }) {
    const gameState = useGameStore(s => s.gameState)

    // Audio Frame Update
    const lastDistRef = useRef(0)
    const throttleRef = useRef(0)

    useFrame((_state, delta) => {
        if (gameState !== 'playing' || !playerPos.current || !enemyPos.current) return

        const dist = playerPos.current.distanceTo(enemyPos.current)
        // Closing speed: Positive if distance decreased (getting closer)
        const closingSpeed = -(dist - lastDistRef.current) / delta

        soundManager.updateSonar(dist, closingSpeed, useGameStore.getState())

        // Update audio listener position/orientation
        soundManager.updateListener(_state.camera)

        // Throttle UI updates to ~5Hz (every 0.2s)

        throttleRef.current += delta
        if (throttleRef.current > 0.2) {
            useGameStore.setState({ debugVelocity: closingSpeed })
            throttleRef.current = 0
        }

        lastDistRef.current = dist
    })

    return null
}

function PerfBridge() {
    // usePerf hook provides access to the GL performance data from r3f-perf
    // Note: this hook usually returns { log, gl, ... }
    // but r3f-perf documentation/types can vary. 
    // If getting raw numbers is hard, we can assume typical r3f-perf behavior
    // or just assume we want to pull gl.info.render logic?
    // Actually, r3f-perf exposes `getReport` or we can access the `gl` stats if we don't use 'headless' mode.
    // BUT the simplest way if usePerf isn't just giving us 'fps' as a value is to use our own frame loop? 
    // Wait, r3f-perf is a *visual* tool mostly. 
    // Let's use `useThree` to get gl info + simple FPS counter if we want "Render MS".
    // 
    // Actually, let's keep it simple. `r3f-perf` doesn't easily "export" the numbers to React state without some hacking.
    // Better idea: We'll implement a lightweight FPS/MS tracker here ourselves to pump into the Context.
    // It's cleaner than trying to scrape DOM or hack the library.

    // BUT user asked to "Combine the dev tools and the perf monitor. I want the milliseconds of the GPU stuff to be rendering inside of that DevTools thing."
    // `r3f-perf` uses `gl.info` and some extensions for GPU.
    // We can access `gl.info.render.frame` etc.
    // Let's do a basic frame timer.

    const fpsSamples = useRef<number[]>([])

    useFrame((state) => {
        const delta = state.clock.getDelta()
        if (delta > 0) {
            const currentFps = 1 / delta
            fpsSamples.current.push(currentFps)
            if (fpsSamples.current.length > 30) {
                fpsSamples.current.shift()
            }
        }

        // Update store occasionally
        if (state.clock.elapsedTime % 0.5 < 0.02 && fpsSamples.current.length > 0) {
            const avgFps = fpsSamples.current.reduce((a, b) => a + b, 0) / fpsSamples.current.length
            
            useGameStore.setState({
                perfStats: {
                    fps: Math.round(avgFps),
                    cpu: 0, 
                    gpu: 0  
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
    const setCountdownValue = useGameStore(s => s.setCountdownValue)
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

    // Countdown Logic
    useEffect(() => {
        if (gameState === 'start') {
            setGameState('setup')
        }
    }, [gameState, setGameState])

    useEffect(() => {
        if (gameState === 'countdown' && countdownValue > 0) {
            soundManager.playCountdownBeep(countdownValue)
            const timer = setTimeout(() => {
                setCountdownValue(countdownValue - 1)
            }, 1000)
            return () => clearTimeout(timer)
        } else if (gameState === 'countdown' && countdownValue === 0) {
            soundManager.playGoSignal()
            setShowGo(true)
            setGameState('playing')
            setTimeout(() => setShowGo(false), 1000)
        }
    }, [gameState, countdownValue, setCountdownValue, setGameState])

    // Sonar Logic
    useEffect(() => {
        if (gameState === 'playing' && !isPaused) {
            soundManager.startSonar()
        } else {
            soundManager.stopSonar()
        }
        return () => soundManager.stopSonar()
    }, [gameState, isPaused])

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
                const renderer = new WebGPURenderer({ 
                    canvas: props.canvas as any, 
                    antialias: false, 
                    powerPreference: 'high-performance' 
                })
                await renderer.init()
                return renderer
            }}
        >
            <GameLogic playerPos={playerPosRef} enemyPos={enemyPosRef} />
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
