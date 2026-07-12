import type { PhysicsBackend } from './types'

export function getRuntimePhysicsBackend(search: string): PhysicsBackend {
    const params = new URLSearchParams(search)
    // box3d is the shipping game; cannon is the retired legacy backend, opt-in only.
    return params.get('physics') === 'cannon' ? 'cannon' : 'box3d'
}
