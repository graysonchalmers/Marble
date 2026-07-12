import { describe, expect, it } from 'vitest'
import { getRuntimePhysicsBackend } from './runtime'

describe('getRuntimePhysicsBackend', () => {
    it('defaults to box3d when no physics param is provided', () => {
        expect(getRuntimePhysicsBackend('')).toBe('box3d')
    })

    it('selects box3d when explicitly requested', () => {
        expect(getRuntimePhysicsBackend('?physics=box3d')).toBe('box3d')
    })

    it('selects cannon when explicitly requested (legacy opt-in)', () => {
        expect(getRuntimePhysicsBackend('?physics=cannon')).toBe('cannon')
    })

    it('defaults unknown backend values to box3d', () => {
        expect(getRuntimePhysicsBackend('?physics=rapier')).toBe('box3d')
    })
})
