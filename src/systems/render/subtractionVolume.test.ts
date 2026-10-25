import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createSubtractionVolume, cylinderDistance, volumeVisibility } from './subtractionVolume'

describe('finite subtraction cylinder', () => {
  it('rounds the endpoint only in capsule mode', () => {
    const v = createSubtractionVolume()
    v.end.set(0, 0, 10); v.radius = 2; v.feather = 0
    const behindEnd = new Vector3(0, 0, 11)
    expect(volumeVisibility(behindEnd, v)).toBe(1)
    v.shape = 'capsule'
    expect(volumeVisibility(behindEnd, v)).toBe(0)
    expect(cylinderDistance(new Vector3(0, 0, 13), v)).toBe(1)
  })
  it('cuts its core, feathers outside it, and restores beyond the feather', () => {
    const v = createSubtractionVolume()
    v.end.set(0, 0, 10); v.radius = 2; v.feather = 1
    expect(volumeVisibility(new Vector3(0, 0, 5), v)).toBe(0)
    expect(volumeVisibility(new Vector3(2.5, 0, 5), v)).toBeCloseTo(0.5)
    expect(volumeVisibility(new Vector3(3, 0, 5), v)).toBe(1)
    expect(volumeVisibility(new Vector3(0, 0, -2), v)).toBe(1)
    expect(volumeVisibility(new Vector3(0, 0, 12), v)).toBe(1)
  })
  it('works with arbitrary axes and translation, including flat end caps', () => {
    const v = createSubtractionVolume()
    v.start.set(4, 3, 2); v.end.set(14, 3, 2); v.radius = 2
    expect(cylinderDistance(new Vector3(9, 3, 2), v)).toBe(-2)
    expect(cylinderDistance(new Vector3(15, 3, 2), v)).toBe(1)
    expect(cylinderDistance(new Vector3(9, 6, 2), v)).toBe(1)
  })
  it('handles coincident endpoints, disabled cuts and a hard edge', () => {
    const v = createSubtractionVolume()
    v.end.copy(v.start)
    expect(volumeVisibility(v.start, v)).toBe(1)
    v.end.set(0, 0, 10); v.feather = 0
    expect(volumeVisibility(new Vector3(0, 0, 5), v)).toBe(0)
    v.enabled = false
    expect(volumeVisibility(new Vector3(0, 0, 5), v)).toBe(1)
  })
})
