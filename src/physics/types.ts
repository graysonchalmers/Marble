export type PhysicsBackend = 'box3d'

export interface PhysicsVector3 {
    x: number
    y: number
    z: number
}

export interface PhysicsQuaternion {
    x: number
    y: number
    z: number
    w: number
}

export interface PhysicsTransform {
    position: PhysicsVector3
    rotation: PhysicsQuaternion
}

export interface PhysicsBodyHandle {
    readonly backend: PhysicsBackend
    readonly id: number
}

export interface PhysicsRaycastHit {
    hit: boolean
    point: PhysicsVector3
    normal: PhysicsVector3
    fraction: number
    body?: PhysicsBodyHandle
}

export interface PhysicsWorldAdapter {
    readonly backend: PhysicsBackend
    step(dt: number): void
    reset(): void
    destroy(): void
}

