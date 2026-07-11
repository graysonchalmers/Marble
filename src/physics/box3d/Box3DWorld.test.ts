import { describe, expect, it, vi } from 'vitest'
import { Box3DWorld } from './Box3DWorld'
import type { MarbleBox3DBridgeExports } from './box3dBridge'

function makeBridge() {
    const heapBuffer = new ArrayBuffer(512)
    const heap = new Float32Array(heapBuffer)
    let nextPtr = 0

    const bridge = {
        manifest: {
            version: '0.1.0',
            moduleUrl: '/box3d/box3d_bridge.js',
            wasmUrl: '/box3d/box3d_bridge.wasm'
        },
        module: {
            HEAPF32: heap,
            _malloc: vi.fn((size: number) => {
                const ptr = nextPtr
                nextPtr += size
                return ptr
            }),
            _free: vi.fn(),
            cwrap: vi.fn()
        },
        bridgeVersion: vi.fn(() => 1),
        health: vi.fn(() => 1),
        worldCreate: vi.fn(() => 64),
        worldDestroy: vi.fn(),
        worldStep: vi.fn(() => 1),
        createStaticBox: vi.fn(() => 1001),
        createDynamicSphere: vi.fn(() => 1002),
        createDynamicBox: vi.fn(() => 1007),
        createHeightfield: vi.fn(() => 2001),
        bodyDestroy: vi.fn(),
        bodyApplyTorque: vi.fn(),
        bodyApplyForceToCenter: vi.fn(),
        bodyApplyLinearImpulseToCenter: vi.fn(),
        bodyGetLinearVelocity: vi.fn((_bodyPtr: number, outPtr: number) => {
            const offset = outPtr / Float32Array.BYTES_PER_ELEMENT
            heap[offset] = 1.5
            heap[offset + 1] = 2.5
            heap[offset + 2] = 3.5
            return 1
        }),
        bodySetLinearVelocity: vi.fn(),
        bodyGetAngularVelocity: vi.fn((_bodyPtr: number, outPtr: number) => {
            const offset = outPtr / Float32Array.BYTES_PER_ELEMENT
            heap[offset] = 0.5
            heap[offset + 1] = 0.25
            heap[offset + 2] = 0.75
            return 1
        }),
        bodySetAngularVelocity: vi.fn(),
        bodySetDamping: vi.fn(),
        bodySetTransform: vi.fn(),
        readBodyTransform: vi.fn((_bodyPtr: number, outPtr: number) => {
            const offset = outPtr / Float32Array.BYTES_PER_ELEMENT
            heap[offset] = 1
            heap[offset + 1] = 2
            heap[offset + 2] = 3
            heap[offset + 3] = 0.1
            heap[offset + 4] = 0.2
            heap[offset + 5] = 0.3
            heap[offset + 6] = 0.9
            return 1
        }),
        worldRaycast: vi.fn((_worldPtr: number, _ox: number, _oy: number, _oz: number, _dx: number, _dy: number, _dz: number, outPtr: number) => {
            const offset = outPtr / Float32Array.BYTES_PER_ELEMENT
            heap[offset] = 1.0
            heap[offset + 1] = 1.25
            heap[offset + 2] = 2.5
            heap[offset + 3] = 3.75
            heap[offset + 4] = 0.0
            heap[offset + 5] = 1.0
            heap[offset + 6] = 0.0
            heap[offset + 7] = 0.5
            return 1
        })
    } satisfies MarbleBox3DBridgeExports

    return bridge
}

describe('Box3DWorld', () => {
    it('creates the smoke-test world and reads the sphere transform', () => {
        const bridge = makeBridge()
        const world = new Box3DWorld(bridge)

        expect(world.backend).toBe('box3d')
        expect(world.bridgeVersion).toBe(1)
        expect(bridge.worldCreate).toHaveBeenCalledWith(0, -9.81, 0)
        expect(bridge.createStaticBox).toHaveBeenCalledWith(64, 0, -0.5, 0, 4, 0.5, 4, 0.5, 0.2)
        expect(bridge.createDynamicSphere).toHaveBeenCalledWith(64, 0, 4, 0, 0.35, 1.0, 0.5, 0.2)

        world.step(1 / 60)
        expect(bridge.worldStep).toHaveBeenCalledWith(64, 1 / 60, 4)

        expect(world.readSphereTransform()).toEqual({
            position: { x: 1, y: 2, z: 3 },
            rotation: {
                x: expect.closeTo(0.1),
                y: expect.closeTo(0.2),
                z: expect.closeTo(0.3),
                w: expect.closeTo(0.9)
            }
        })

        // Verify other physics API wrappers
        world.applyTorque(1002, 1, 2, 3)
        expect(bridge.bodyApplyTorque).toHaveBeenCalledWith(1002, 1, 2, 3)

        expect(world.getLinearVelocity(1002)).toEqual({ x: 1.5, y: 2.5, z: 3.5 })
        expect(world.getAngularVelocity(1002)).toEqual({ x: 0.5, y: 0.25, z: 0.75 })

        expect(world.raycastClosest(0, 5, 0, 0, -1, 0)).toEqual({
            hit: true,
            point: { x: 1.25, y: 2.5, z: 3.75 },
            normal: { x: 0, y: 1.0, z: 0 },
            fraction: 0.5
        })

        world.destroy()
        expect(bridge.worldDestroy).toHaveBeenCalledWith(64)
        expect(bridge.module._free).toHaveBeenCalledTimes(3) // transform, velocity, raycast
    })

    it('recreates native state on reset', () => {
        const bridge = makeBridge()
        const world = new Box3DWorld(bridge)

        world.reset()

        expect(bridge.worldDestroy).toHaveBeenCalledWith(64)
        expect(bridge.worldCreate).toHaveBeenCalledTimes(2)
        world.destroy()
    })
})
