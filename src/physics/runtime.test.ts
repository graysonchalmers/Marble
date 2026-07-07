import { describe, expect, it } from 'vitest'
import { getRuntimePhysicsBackend } from './runtime'

describe('getRuntimePhysicsBackend', () => {
    it('defaults to cannon when no physics param is provided', () => {
        expect(getRuntimePhysicsBackend('')).toBe('cannon')
    })

    it('selects box3d when explicitly requested', () => {
        expect(getRuntimePhysicsBackend('?physics=box3d')).toBe('box3d')
    })

    it('ignores unknown backend values', () => {
        expect(getRuntimePhysicsBackend('?physics=rapier')).toBe('cannon')
    })
})
