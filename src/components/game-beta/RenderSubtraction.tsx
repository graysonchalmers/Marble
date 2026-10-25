import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { patchSubtractionMaterial, type SubtractionVolume } from '../../systems/render/subtractionVolume'

/** Built-in mesh, point and line materials participate. Custom ShaderMaterial
 * effects need an explicit adapter. Objects opt out with subtractExclude=true. */
export function RenderSubtraction({ volume, update }: { volume: SubtractionVolume; update?: () => void }) {
  const { scene, camera } = useThree()
  const syncRef = useRef<() => void>(() => {})
  useEffect(() => {
    const patched = new Map<THREE.Material, () => void>()
    const sync = () => scene.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return
      if (object.userData.subtractExclude) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (material instanceof THREE.ShaderMaterial || material instanceof THREE.SpriteMaterial || patched.has(material)) continue
        patched.set(material, patchSubtractionMaterial(material, volume, camera, update))
      }
    })
    sync()
    // React may add scenery as the sim boots or rebuilds.
    syncRef.current = sync
    return () => {
      syncRef.current = () => {}
      patched.forEach(undo => undo())
    }
  }, [scene, camera, volume, update])
  useFrame(() => { syncRef.current() })
  return null
}
