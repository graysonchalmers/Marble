/**
 * Regression: starting a replay (or any settings rebuild) destroys the live sim's world
 * in the boot effect's cleanup, but the old loop tick stays registered until the async
 * boot hands over the new sim. Those few frames used to step the dead world and throw
 * "Failed to read body transform". The tick must skip a destroyed world without touching
 * the bridge or consuming a replay frame.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Box3DWorld } from '../../physics/box3d/Box3DWorld'
import type { MarbleBox3DBridgeExports } from '../../physics/box3d/box3dBridge'
import { MarbleSim, type SimInput } from '../../systems/sim/MarbleSim'
import { ReplayRecorder } from '../../systems/replay/recorder'
import { ReplayPlayer } from '../../systems/replay/player'
import { useGameStore } from '../../store/useGameStore'
import { makeSimTick } from './simTick'

/** Mock bridge that fails reads on destroyed bodies, like the real WASM (returns 0). */
function makeBridge() {
    const heap = new Float32Array(1024)
    let nextPtr = 8
    let nextBodyId = 100
    const dead = new Set<number>()
    const explicit = {
        manifest: { version: '0.1.0', moduleUrl: '', wasmUrl: '' },
        module: {
            HEAPF32: heap,
            _malloc: vi.fn((size: number) => { const p = nextPtr; nextPtr += size; return p }),
            _free: vi.fn(),
            cwrap: vi.fn()
        },
        createStaticBox: vi.fn(() => nextBodyId++),
        createDynamicSphere: vi.fn(() => nextBodyId++),
        createDynamicBox: vi.fn(() => nextBodyId++),
        createHeightfield: vi.fn(() => nextBodyId++),
        bodyDestroy: vi.fn((ptr: number) => { dead.add(ptr) }),
        readBodyTransform: vi.fn((ptr: number, outPtr: number) => {
            if (dead.has(ptr)) return 0
            heap.fill(0, outPtr / 4, outPtr / 4 + 7)
            heap[outPtr / 4 + 6] = 1
            return 1
        }),
        bodyGetLinearVelocity: vi.fn((ptr: number) => (dead.has(ptr) ? 0 : 1)),
        bodyGetAngularVelocity: vi.fn((ptr: number) => (dead.has(ptr) ? 0 : 1)),
    }
    // Everything else (step, impulses, raycast, ...) just succeeds.
    return new Proxy(explicit, {
        get: (t, k) => (k in t ? t[k as keyof typeof t] : ((t as Record<string | symbol, unknown>)[k] = vi.fn(() => 1)))
    }) as unknown as MarbleBox3DBridgeExports & typeof explicit
}

const NO_KEYS: SimInput = { w: false, a: false, s: false, d: false, space: false, shift: false }

function setup(replay: { player: ReplayPlayer } | null = null) {
    const bridge = makeBridge()
    const world = new Box3DWorld(bridge)
    const sim = new MarbleSim(world, { enemySize: 0.9, enemyMass: 2.5 })
    const recorder = new ReplayRecorder()
    vi.spyOn(recorder, 'capture')
    const tick = makeSimTick({
        sim,
        keys: { current: { ...NO_KEYS } },
        replayRef: { current: replay },
        recorderRef: { current: recorder },
        earlyReleasedRef: { current: false },
    })
    bridge.readBodyTransform.mockClear()
    return { bridge, world, tick, recorder }
}

describe('makeSimTick on a destroyed world', () => {
    beforeEach(() => { useGameStore.setState({ gameState: 'playing' }) })

    it('steps a live world (control: the mock does see stepping)', () => {
        const { bridge, tick, recorder } = setup()
        tick(1 / 60)
        expect(bridge.readBodyTransform).toHaveBeenCalled()
        expect(recorder.capture).toHaveBeenCalledTimes(1)
    })

    it('live play: skips without calling the bridge or recording', () => {
        const { bridge, world, tick, recorder } = setup()
        world.destroy()
        expect(() => tick(1 / 60)).not.toThrow()
        expect(bridge.readBodyTransform).not.toHaveBeenCalled()
        expect(recorder.capture).not.toHaveBeenCalled()
    })

    it('setup state: skips resetPositions too', () => {
        useGameStore.setState({ gameState: 'setup' })
        const { bridge, world, tick } = setup()
        world.destroy()
        expect(() => tick(1 / 60)).not.toThrow()
        expect(bridge.readBodyTransform).not.toHaveBeenCalled()
    })

    it('replay: skips without consuming a recorded frame', () => {
        const frame = { input: NO_KEYS, params: { enemySpeed: 1, enemyAirControl: 0.2 } }
        const player = new ReplayPlayer({ header: { version: 2, seed: 1, fixedDt: 1 / 60, enemySize: 0.9, enemyMass: 2.5, gravityY: -9.81, recordedAt: 0 }, frames: [frame, frame] })
        const { world, tick } = setup({ player })
        world.destroy()
        expect(() => tick(1 / 60)).not.toThrow()
        expect(player.position).toBe(0)
    })
})
