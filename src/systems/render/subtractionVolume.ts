import * as THREE from 'three'

/** Finite, flat-ended cylinder. Feather extends outward from the hidden core. */
export type SubtractionVolume = {
  start: THREE.Vector3
  end: THREE.Vector3
  radius: number
  feather: number
  enabled: boolean
  shape: 'cylinder' | 'capsule'
}

export function createSubtractionVolume(): SubtractionVolume {
  return { start: new THREE.Vector3(), end: new THREE.Vector3(0, 0, 1), radius: 0.85, feather: 0.65, enabled: true, shape: 'cylinder' }
}

/** Signed distance to a capped cylinder; coincident endpoints disable the cut. */
export function cylinderDistance(point: THREE.Vector3, volume: SubtractionVolume): number {
  const axis = volume.end.clone().sub(volume.start)
  const length = axis.length()
  if (length < 1e-5) return Infinity
  axis.divideScalar(length)
  const offset = point.clone().sub(volume.start)
  const axial = offset.dot(axis)
  if (volume.shape === 'capsule') return offset.addScaledVector(axis, -THREE.MathUtils.clamp(axial, 0, length)).length() - Math.max(0, volume.radius)
  const radial = offset.addScaledVector(axis, -axial).length() - Math.max(0, volume.radius)
  const cap = Math.abs(axial - length * 0.5) - length * 0.5
  return Math.min(Math.max(radial, cap), 0) + Math.hypot(Math.max(radial, 0), Math.max(cap, 0))
}

export function volumeVisibility(point: THREE.Vector3, volume: SubtractionVolume): number {
  if (!volume.enabled) return 1
  const distance = cylinderDistance(point, volume)
  if (volume.feather <= 0) return distance <= 0 ? 0 : 1
  const t = THREE.MathUtils.clamp(distance / volume.feather, 0, 1)
  return t * t * (3 - 2 * t)
}

/** Patch built-in mesh materials, preserving lighting, maps, instancing and prior hooks.
 * Dithered discard keeps ordinary opaque depth ordering. Cut is main-view only:
 * shadow and reflection passes retain the intact world. Returns an undo function.
 */
export function patchSubtractionMaterial(material: THREE.Material, volume: SubtractionVolume, mainCamera: THREE.Camera, update?: () => void): () => void {
  const previousCompile = material.onBeforeCompile
  const previousKey = material.customProgramCacheKey
  const previousRender = material.onBeforeRender
  const uniforms = {
    cutStart: { value: volume.start }, cutEnd: { value: volume.end },
    cutRadius: { value: volume.radius }, cutFeather: { value: volume.feather }, cutEnabled: { value: 0 },
    cutShape: { value: 0 },
  }
  material.onBeforeCompile = function(shader, renderer) {
    previousCompile.call(this, shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = 'varying vec3 vCutWorld;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      vec4 cutWorld = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        cutWorld = batchingMatrix * cutWorld;
      #endif
      #ifdef USE_INSTANCING
        cutWorld = instanceMatrix * cutWorld;
      #endif
      vCutWorld = (modelMatrix * cutWorld).xyz;
    `)
    shader.fragmentShader = `
      varying vec3 vCutWorld;
      uniform vec3 cutStart;
      uniform vec3 cutEnd;
      uniform float cutRadius;
      uniform float cutFeather;
      uniform float cutEnabled;
      uniform float cutShape;
    ` + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
      #include <clipping_planes_fragment>
      if (cutEnabled > 0.5) {
        vec3 cutAxis = cutEnd - cutStart;
        float cutLength = length(cutAxis);
        if (cutLength > 0.00001) {
          cutAxis /= cutLength;
          vec3 cutOffset = vCutWorld - cutStart;
          float cutAxial = dot(cutOffset, cutAxis);
          vec2 cutD = vec2(length(cutOffset - cutAxis * cutAxial) - max(cutRadius, 0.0),
            abs(cutAxial - cutLength * 0.5) - cutLength * 0.5);
          float cutDistance = min(max(cutD.x, cutD.y), 0.0) + length(max(cutD, 0.0));
          if (cutShape > 0.5) cutDistance = length(cutOffset - cutAxis * clamp(cutAxial, 0.0, cutLength)) - max(cutRadius, 0.0);
          float cutVisibility = cutFeather > 0.0 ? smoothstep(0.0, cutFeather, cutDistance) : step(0.000001, cutDistance);
          // Stable screen-space ordered noise; no transparent-object sorting or time flicker.
          float cutNoise = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
          if (cutVisibility <= cutNoise) discard;
        }
      }
    `)
  }
  material.customProgramCacheKey = function() { return previousKey.call(this) + '|subtraction-volume-v2' }
  material.onBeforeRender = function(renderer, scene, camera, geometry, object, group) {
    previousRender.call(this, renderer, scene, camera, geometry, object, group)
    update?.()
    uniforms.cutEnabled.value = volume.enabled && camera === mainCamera ? 1 : 0
    uniforms.cutRadius.value = volume.radius
    uniforms.cutFeather.value = volume.feather
    uniforms.cutShape.value = volume.shape === 'capsule' ? 1 : 0
  }
  material.needsUpdate = true
  return () => {
    material.onBeforeCompile = previousCompile
    material.customProgramCacheKey = previousKey
    material.onBeforeRender = previousRender
    material.needsUpdate = true
  }
}
