import type { PhysicsBackend } from './types'

export function getRuntimePhysicsBackend(search: string): PhysicsBackend {
    const params = new URLSearchParams(search)
    return params.get('physics') === 'box3d' ? 'box3d' : 'cannon'
}
