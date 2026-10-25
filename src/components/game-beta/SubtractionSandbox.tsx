import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { createSubtractionVolume, type SubtractionVolume } from '../../systems/render/subtractionVolume'
import { RenderSubtraction } from './RenderSubtraction'
import './subtractionSandbox.css'

function InstancedWall() {
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    if (!ref.current) return
    const matrix = new THREE.Matrix4()
    for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) {
      matrix.makeTranslation((x - 2) * 1.6, 0.8 + y * 1.6, -2)
      ref.current.setMatrixAt(y * 5 + x, matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  }, [])
  return <instancedMesh ref={ref} args={[undefined, undefined, 15]} frustumCulled={false}>
    <boxGeometry args={[1.57, 1.57, 0.45]} /><meshStandardMaterial color="#ac8d65" roughness={0.7} side={THREE.DoubleSide} />
  </instancedMesh>
}

function VolumeGuide({ volume, show }: { volume: SubtractionVolume; show: boolean }) {
  const ref = useRef<THREE.LineSegments>(null)
  const capStart = useRef<THREE.LineSegments>(null)
  const capEnd = useRef<THREE.LineSegments>(null)
  const startRef = useRef<THREE.Mesh>(null)
  const endRef = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => {
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)
    const edges = new THREE.EdgesGeometry(cylinder)
    cylinder.dispose()
    return edges
  }, [])
  const axis = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const capGeometry = useMemo(() => {
    const sphere = new THREE.SphereGeometry(1, 12, 8)
    const edges = new THREE.WireframeGeometry(sphere)
    sphere.dispose()
    return edges
  }, [])
  useFrame(() => {
    startRef.current?.position.copy(volume.start)
    endRef.current?.position.copy(volume.end)
    for (const [cap, position] of [[capStart.current, volume.start], [capEnd.current, volume.end]] as const) {
      if (!cap) continue
      cap.visible = show && volume.shape === 'capsule'
      cap.position.copy(position)
      cap.scale.setScalar(volume.radius)
    }
    if (!ref.current) return
    axis.subVectors(volume.end, volume.start)
    const length = axis.length()
    ref.current.visible = show && length > 1e-5
    ref.current.position.copy(volume.start).add(volume.end).multiplyScalar(0.5)
    if (length > 1e-5) ref.current.quaternion.setFromUnitVectors(up, axis.divideScalar(length))
    ref.current.scale.set(volume.radius, length, volume.radius)
  })
  return <>
    <lineSegments ref={ref} geometry={geometry} userData={{ subtractExclude: true }}><lineBasicMaterial color="#ffffff" transparent opacity={0.22} depthWrite={false} /></lineSegments>
    <lineSegments ref={capStart} geometry={capGeometry} userData={{ subtractExclude: true }}><lineBasicMaterial color="#ffffff" transparent opacity={0.12} depthWrite={false} /></lineSegments>
    <lineSegments ref={capEnd} geometry={capGeometry} userData={{ subtractExclude: true }}><lineBasicMaterial color="#ffffff" transparent opacity={0.12} depthWrite={false} /></lineSegments>
    <mesh ref={startRef} userData={{ subtractExclude: true }}><sphereGeometry args={[0.12, 16, 12]} /><meshBasicMaterial color="#ffffff" /></mesh>
    <mesh ref={endRef} userData={{ subtractExclude: true }}><sphereGeometry args={[0.12, 16, 12]} /><meshBasicMaterial color="#ffcf85" /></mesh>
  </>
}

function TestEffects() {
  const geometry = useMemo(() => {
    const positions: number[] = []
    for (let y = 0; y < 9; y++) for (let x = 0; x < 17; x++) positions.push((x - 8) * 0.3, 0.3 + y * 0.3, 1)
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  }, [])
  const path = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4, 1.5, 1), new THREE.Vector3(4, 1.5, 1)]), [])
  return <>
    <points geometry={geometry}><pointsMaterial color="#ffc77a" size={0.075} /></points>
    <lineSegments geometry={path}><lineBasicMaterial color="#ffdfb2" /></lineSegments>
  </>
}

function LabScene({ volume, cameraPresetRef, show, testEffects }: { volume: SubtractionVolume; cameraPresetRef: { current: boolean }; show: boolean; testEffects: boolean }) {
  const { camera } = useThree()
  const target = useMemo(() => new THREE.Vector3(0, 1.5, -4), [])
  const update = useCallback(() => {
    if (cameraPresetRef.current) { volume.start.copy(camera.position); volume.end.copy(target) }
  }, [camera, volume, target, cameraPresetRef])
  return <>
    <RenderSubtraction volume={volume} update={update} />
    <ambientLight intensity={0.8} />
    <directionalLight position={[5, 10, 8]} intensity={2.5} />
    <color attach="background" args={['#171b22']} />
    <OrbitControls makeDefault target={[0, 1.5, 0]} minDistance={3} maxDistance={30} />
    <gridHelper args={[24, 24, '#454b58', '#292f3a']} position={[0, -0.02, 0]} userData={{ subtractExclude: true }} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} userData={{ subtractExclude: true }}>
      <planeGeometry args={[24, 24]} /><meshStandardMaterial color="#222832" roughness={1} />
    </mesh>
    {/* Two walls reveal that only intersecting surface regions disappear. */}
    <mesh position={[0, 2.5, 0]}>
      <boxGeometry args={[8, 5, 0.45]} /><meshStandardMaterial color="#748798" roughness={0.7} side={THREE.DoubleSide} />
    </mesh>
    <InstancedWall />
    <mesh position={[4.3, 2, 1]} rotation={[0.2, 0, 0.3]}>
      <cylinderGeometry args={[0.65, 0.65, 4, 24]} /><meshStandardMaterial color="#a89abc" />
    </mesh>
    <mesh position={target} userData={{ subtractExclude: true }}>
      <sphereGeometry args={[0.5, 32, 24]} /><meshStandardMaterial color="#5fffd2" emissive="#1a7d60" emissiveIntensity={0.5} />
    </mesh>
    <VolumeGuide volume={volume} show={show} />
    {testEffects && <TestEffects />}
  </>
}

export function SubtractionSandbox() {
  const volume = useMemo(() => {
    const v = createSubtractionVolume()
    v.start.set(0, 1.5, 6); v.end.set(0, 1.5, -4); v.radius = 1; v.feather = 0.65
    return v
  }, [])
  const [, refresh] = useState(0)
  const [cameraPreset, setCameraPreset] = useState(false)
  const cameraPresetRef = useRef(false)
  const [show, setShow] = useState(true)
  const [testEffects, setTestEffects] = useState(false)
  const slider = (label: string, value: number, min: number, max: number, change: (n: number) => void) =>
    <label className="cut-slider" key={label}><span>{label}<output>{value.toFixed(2)}</output></span>
      <input aria-label={label} type="range" min={min} max={max} step={0.05} value={value}
        onChange={e => { change(Number(e.target.value)); refresh(n => n + 1) }} /></label>
  return <main className="cut-lab">
    <section className="cut-viewport" aria-label="Subtraction volume preview">
      <Canvas camera={{ position: [8, 6, 11], fov: 48 }} dpr={[1, 2]}><LabScene volume={volume} cameraPresetRef={cameraPresetRef} show={show} testEffects={testEffects} /></Canvas>
      <div className="cut-caption">Drag to orbit · Scroll to zoom</div>
    </section>
    <aside className="cut-panel">
      <a href="?">← Back to game</a>
      <p className="cut-eyebrow">MARBLE / RENDER LAB</p>
      <h1>Negative space</h1>
      <p>A cylinder that erases only the surfaces inside it. The mint target stays visible.</p>
      <label className="cut-check"><input type="checkbox" checked={volume.enabled} onChange={e => { volume.enabled = e.target.checked; refresh(n => n + 1) }} />Enable subtraction</label>
      <label className="cut-check"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />Show cylinder guide</label>
      <label className="cut-check"><input type="checkbox" checked={testEffects} onChange={e => setTestEffects(e.target.checked)} />Test particles &amp; lines</label>
      <label className="cut-check"><input type="checkbox" checked={cameraPreset} onChange={e => { cameraPresetRef.current = e.target.checked; setCameraPreset(e.target.checked); if (!e.target.checked) { volume.start.set(0, 1.5, 6); volume.end.set(0, 1.5, -4) } }} />Camera → target preset</label>
      <label className="cut-slider"><span>Shape</span><select aria-label="Shape" value={volume.shape} onChange={e => { volume.shape = e.target.value as 'cylinder' | 'capsule'; refresh(n => n + 1) }}>
        <option value="cylinder">Cylinder (flat ends)</option><option value="capsule">Capsule (rounded ends)</option>
      </select></label>
      {slider('Radius', volume.radius, 0.1, 4, n => { volume.radius = n })}
      {slider('Feather', volume.feather, 0, 2, n => { volume.feather = n })}
      {!cameraPreset && <div className="cut-endpoints">{(['start', 'end'] as const).map(endpoint => <fieldset key={endpoint}>
        <legend>{endpoint === 'start' ? 'Point A' : 'Point B'}</legend>
        {(['x', 'y', 'z'] as const).map(axis => slider(`${endpoint === 'start' ? 'A' : 'B'} ${axis.toUpperCase()}`, volume[endpoint][axis], axis === 'y' ? 0 : -8, 8, n => { volume[endpoint][axis] = n }))}
      </fieldset>)}</div>}
      <button onClick={() => { cameraPresetRef.current = false; setCameraPreset(false); volume.start.set(0, 1.5, 6); volume.end.set(0, 1.5, -4); volume.radius = 1; volume.feather = 0.65; volume.enabled = true; volume.shape = 'cylinder'; setShow(true); setTestEffects(false); refresh(n => n + 1) }}>Reset volume</button>
      <p className="cut-note">The feather uses fine stippling. Cuts have open interiors; shadows and reflections retain the intact world.</p>
    </aside>
  </main>
}
