import type { PhysicsBackend, PhysicsTransform, PhysicsWorldAdapter, PhysicsVector3, PhysicsRaycastHit } from '../types'
import type { MarbleBox3DBridgeExports } from './box3dBridge'

const TRANSFORM_FLOAT_COUNT = 7
const TRANSFORM_BYTE_COUNT = TRANSFORM_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT

const VELOCITY_FLOAT_COUNT = 3
const VELOCITY_BYTE_COUNT = VELOCITY_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT

const RAYCAST_FLOAT_COUNT = 8
const RAYCAST_BYTE_COUNT = RAYCAST_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT

export class Box3DWorld implements PhysicsWorldAdapter {
    readonly backend: PhysicsBackend = 'box3d'

    private readonly bridge: MarbleBox3DBridgeExports
    private readonly transformPtr: number
    private readonly velocityPtr: number
    private readonly raycastPtr: number
    private worldPtr = 0
    private bodies: number[] = []
    private smokeSpherePtr = 0

    constructor(bridge: MarbleBox3DBridgeExports) {
        this.bridge = bridge
        this.transformPtr = bridge.module._malloc(TRANSFORM_BYTE_COUNT)
        this.velocityPtr = bridge.module._malloc(VELOCITY_BYTE_COUNT)
        this.raycastPtr = bridge.module._malloc(RAYCAST_BYTE_COUNT)
        this.reset()
    }

    get bridgeVersion(): number {
        return this.bridge.bridgeVersion()
    }

    step(dt: number): void {
        if (!this.worldPtr) return
        this.bridge.worldStep(this.worldPtr, dt, 4)
    }

    reset(): void {
        this.destroyWorldOnly()

        this.worldPtr = this.bridge.worldCreate(0, -9.81, 0)
        if (!this.worldPtr) {
            throw new Error('Failed to create Box3D world.')
        }

        this.bodies = []

        // Maintain compatibility for the smoke test (falling sphere)
        const floorPtr = this.bridge.createStaticBox(this.worldPtr, 0, -0.5, 0, 4, 0.5, 4, 0.5, 0.2)
        const spherePtr = this.bridge.createDynamicSphere(this.worldPtr, 0, 4, 0, 0.35, 1.0, 0.5, 0.2)
        if (!floorPtr || !spherePtr) {
            throw new Error('Failed to create Box3D smoke-test bodies.')
        }

        this.bodies.push(floorPtr)
        this.bodies.push(spherePtr)
        this.smokeSpherePtr = spherePtr
    }

    /**
     * Destroy all bodies (including the smoke-test floor/sphere) but keep the
     * world alive. Gameplay setups call this before building the real level so
     * no invisible smoke-test colliders linger under the terrain.
     */
    clearBodies(): void {
        for (const bodyPtr of this.bodies) {
            this.bridge.bodyDestroy(bodyPtr)
        }
        this.bodies = []
        this.smokeSpherePtr = 0
    }

    private destroyWorldOnly(): void {
        for (const bodyPtr of this.bodies) {
            this.bridge.bodyDestroy(bodyPtr)
        }
        this.bodies = []

        if (this.worldPtr) {
            this.bridge.worldDestroy(this.worldPtr)
            this.worldPtr = 0
        }
        this.smokeSpherePtr = 0
    }

    createStaticBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, friction = 0.5, restitution = 0.2): number {
        if (!this.worldPtr) throw new Error('World not initialized')
        const bodyPtr = this.bridge.createStaticBox(this.worldPtr, x, y, z, hx, hy, hz, friction, restitution)
        if (!bodyPtr) throw new Error('Failed to create static box')
        this.bodies.push(bodyPtr)
        return bodyPtr
    }

    createDynamicSphere(x: number, y: number, z: number, radius: number, density = 1.0, friction = 0.5, restitution = 0.2): number {
        if (!this.worldPtr) throw new Error('World not initialized')
        const bodyPtr = this.bridge.createDynamicSphere(this.worldPtr, x, y, z, radius, density, friction, restitution)
        if (!bodyPtr) throw new Error('Failed to create dynamic sphere')
        this.bodies.push(bodyPtr)
        return bodyPtr
    }

    createHeightfield(heights: Float32Array, countX: number, countZ: number, scaleX: number, scaleY: number, scaleZ: number, minHeight: number, maxHeight: number, friction = 0.5, restitution = 0.2): number {
        if (!this.worldPtr) throw new Error('World not initialized')

        const heightsByteCount = heights.length * Float32Array.BYTES_PER_ELEMENT
        const heightsPtr = this.bridge.module._malloc(heightsByteCount)

        const heap = this.bridge.module.HEAPF32
        const offset = heightsPtr / Float32Array.BYTES_PER_ELEMENT
        heap.set(heights, offset)

        try {
            const hfPtr = this.bridge.createHeightfield(
                this.worldPtr,
                heightsPtr,
                countX,
                countZ,
                scaleX,
                scaleY,
                scaleZ,
                minHeight,
                maxHeight,
                friction,
                restitution
            )
            if (!hfPtr) throw new Error('Failed to create native heightfield')
            this.bodies.push(hfPtr)
            return hfPtr
        } finally {
            this.bridge.module._free(heightsPtr)
        }
    }

    applyTorque(bodyPtr: number, tx: number, ty: number, tz: number): void {
        this.bridge.bodyApplyTorque(bodyPtr, tx, ty, tz)
    }

    applyForceToCenter(bodyPtr: number, fx: number, fy: number, fz: number): void {
        this.bridge.bodyApplyForceToCenter(bodyPtr, fx, fy, fz)
    }

    applyLinearImpulseToCenter(bodyPtr: number, ix: number, iy: number, iz: number): void {
        this.bridge.bodyApplyLinearImpulseToCenter(bodyPtr, ix, iy, iz)
    }

    setLinearVelocity(bodyPtr: number, vx: number, vy: number, vz: number): void {
        this.bridge.bodySetLinearVelocity(bodyPtr, vx, vy, vz)
    }

    setAngularVelocity(bodyPtr: number, wx: number, wy: number, wz: number): void {
        this.bridge.bodySetAngularVelocity(bodyPtr, wx, wy, wz)
    }

    setDamping(bodyPtr: number, linearDamping: number, angularDamping: number): void {
        this.bridge.bodySetDamping(bodyPtr, linearDamping, angularDamping)
    }

    bodySetTransform(bodyPtr: number, x: number, y: number, z: number, qx = 0, qy = 0, qz = 0, qw = 1): void {
        this.bridge.bodySetTransform(bodyPtr, x, y, z, qx, qy, qz, qw)
    }

    getLinearVelocity(bodyPtr: number): PhysicsVector3 {
        const ok = this.bridge.bodyGetLinearVelocity(bodyPtr, this.velocityPtr)
        if (ok !== 1) throw new Error('Failed to read linear velocity')
        const offset = this.velocityPtr / Float32Array.BYTES_PER_ELEMENT
        const heap = this.bridge.module.HEAPF32
        return {
            x: heap[offset],
            y: heap[offset + 1],
            z: heap[offset + 2]
        }
    }

    getAngularVelocity(bodyPtr: number): PhysicsVector3 {
        const ok = this.bridge.bodyGetAngularVelocity(bodyPtr, this.velocityPtr)
        if (ok !== 1) throw new Error('Failed to read angular velocity')
        const offset = this.velocityPtr / Float32Array.BYTES_PER_ELEMENT
        const heap = this.bridge.module.HEAPF32
        return {
            x: heap[offset],
            y: heap[offset + 1],
            z: heap[offset + 2]
        }
    }

    readBodyTransform(bodyPtr: number): PhysicsTransform {
        const ok = this.bridge.readBodyTransform(bodyPtr, this.transformPtr)
        if (ok !== 1) throw new Error('Failed to read body transform')
        const offset = this.transformPtr / Float32Array.BYTES_PER_ELEMENT
        const heap = this.bridge.module.HEAPF32
        return {
            position: {
                x: heap[offset],
                y: heap[offset + 1],
                z: heap[offset + 2]
            },
            rotation: {
                x: heap[offset + 3],
                y: heap[offset + 4],
                z: heap[offset + 5],
                w: heap[offset + 6]
            }
        }
    }

    readSphereTransform(): PhysicsTransform {
        if (!this.smokeSpherePtr) {
            throw new Error('Smoke-test sphere is not initialized.')
        }
        return this.readBodyTransform(this.smokeSpherePtr)
    }

    raycastClosest(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): PhysicsRaycastHit {
        const ok = this.bridge.worldRaycast(this.worldPtr, ox, oy, oz, dx, dy, dz, this.raycastPtr)
        if (ok !== 1) throw new Error('Failed to cast ray')
        const offset = this.raycastPtr / Float32Array.BYTES_PER_ELEMENT
        const heap = this.bridge.module.HEAPF32
        const hit = heap[offset] === 1.0
        if (!hit) {
            return { hit: false, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, fraction: 1.0 }
        }
        return {
            hit: true,
            point: {
                x: heap[offset + 1],
                y: heap[offset + 2],
                z: heap[offset + 3]
            },
            normal: {
                x: heap[offset + 4],
                y: heap[offset + 5],
                z: heap[offset + 6]
            },
            fraction: heap[offset + 7]
        }
    }

    destroy(): void {
        this.destroyWorldOnly()
        this.bridge.module._free(this.transformPtr)
        this.bridge.module._free(this.velocityPtr)
        this.bridge.module._free(this.raycastPtr)
    }
}
