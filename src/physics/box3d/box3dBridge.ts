export interface Box3DBridgeManifest {
    version: string
    moduleUrl: string
    wasmUrl: string
    builtAt?: string
    sourceRepo?: string
}

export interface Box3DBridgeStatus {
    available: boolean
    headline: string
    details: string[]
    manifestUrl: string
    expectedFiles: string[]
    manifest?: Box3DBridgeManifest
}

export interface Box3DFetchResponse {
    ok: boolean
    status: number
    text(): Promise<string>
}

export interface MarbleBox3DEmscriptenModule {
    HEAPF32: Float32Array
    _malloc(size: number): number
    _free(ptr: number): void
    cwrap(name: string, returnType: string | null, argTypes: string[]): (...args: number[]) => number
}

export interface MarbleBox3DBridgeExports {
    manifest: Box3DBridgeManifest
    module: MarbleBox3DEmscriptenModule
    bridgeVersion(): number
    health(): number
    worldCreate(gravityX: number, gravityY: number, gravityZ: number): number
    worldDestroy(worldPtr: number): void
    worldStep(worldPtr: number, dt: number, subSteps: number): number
    createStaticBox(worldPtr: number, x: number, y: number, z: number, hx: number, hy: number, hz: number, friction: number, restitution: number): number
    createDynamicSphere(worldPtr: number, x: number, y: number, z: number, radius: number, density: number, friction: number, restitution: number): number
    createHeightfield(worldPtr: number, heightsPtr: number, countX: number, countZ: number, scaleX: number, scaleY: number, scaleZ: number, minHeight: number, maxHeight: number, friction: number, restitution: number): number
    bodyDestroy(bodyPtr: number): void
    bodyApplyTorque(bodyPtr: number, tx: number, ty: number, tz: number): void
    bodyApplyForceToCenter(bodyPtr: number, fx: number, fy: number, fz: number): void
    bodyApplyLinearImpulseToCenter(bodyPtr: number, ix: number, iy: number, iz: number): void
    bodyGetLinearVelocity(bodyPtr: number, outPtr: number): number
    bodySetLinearVelocity(bodyPtr: number, vx: number, vy: number, vz: number): void
    bodyGetAngularVelocity(bodyPtr: number, outPtr: number): number
    bodySetAngularVelocity(bodyPtr: number, wx: number, wy: number, wz: number): void
    bodySetDamping(bodyPtr: number, linearDamping: number, angularDamping: number): void
    readBodyTransform(bodyPtr: number, outPtr: number): number
    worldRaycast(worldPtr: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, outResultPtr: number): number
    bodySetTransform(bodyPtr: number, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): void
}

type MarbleBox3DBridgeFactory = (moduleArg?: {
    locateFile?: (path: string) => string
    print?: (message: string) => void
    printErr?: (message: string) => void
}) => Promise<MarbleBox3DEmscriptenModule>

export type Box3DFetch = (input: string, init?: { cache?: 'default' | 'no-store' }) => Promise<Box3DFetchResponse>

export const BOX3D_BRIDGE_MANIFEST_URL = '/box3d/bridge-manifest.json'

declare global {
    interface Window {
        createMarbleBox3DBridgeModule?: MarbleBox3DBridgeFactory
    }
}

let bridgeModulePromise: Promise<MarbleBox3DBridgeExports> | undefined
let bridgeScriptPromise: Promise<void> | undefined

export function getExpectedBox3DBridgeFiles(): string[] {
    return [
        '/box3d/bridge-manifest.json',
        '/box3d/box3d_bridge.js',
        '/box3d/box3d_bridge.wasm'
    ]
}

function isBridgeManifest(value: unknown): value is Box3DBridgeManifest {
    if (!value || typeof value !== 'object') return false

    const candidate = value as Partial<Box3DBridgeManifest>
    return typeof candidate.version === 'string'
        && typeof candidate.moduleUrl === 'string'
        && typeof candidate.wasmUrl === 'string'
}

function makeMissingAssetsStatus(reason: string): Box3DBridgeStatus {
    return {
        available: false,
        headline: 'Bridge assets are not present yet.',
        details: [
            reason,
            'Build the Box3D web bridge and place the generated manifest, JS loader, and WASM files under public/box3d/.',
            'See docs/BOX3D_BETA_HANDOFF.md for the exact handoff/build steps.'
        ],
        manifestUrl: BOX3D_BRIDGE_MANIFEST_URL,
        expectedFiles: getExpectedBox3DBridgeFiles()
    }
}

export async function loadBox3DBridge(fetchImpl: Box3DFetch | undefined = globalThis.fetch as Box3DFetch | undefined): Promise<Box3DBridgeStatus> {
    if (!fetchImpl) {
        return {
            available: false,
            headline: 'Fetch is unavailable in this runtime.',
            details: [
                'The Box3D beta loader needs a browser-like fetch implementation to probe bridge artifacts.',
                'Use the Vite app route or inject a mock fetch in tests.'
            ],
            manifestUrl: BOX3D_BRIDGE_MANIFEST_URL,
            expectedFiles: getExpectedBox3DBridgeFiles()
        }
    }

    try {
        const response = await fetchImpl(BOX3D_BRIDGE_MANIFEST_URL, { cache: 'no-store' })

        if (!response.ok) {
            return makeMissingAssetsStatus(
                `Expected manifest at ${BOX3D_BRIDGE_MANIFEST_URL}, but the request returned HTTP ${response.status}.`
            )
        }

        const raw = await response.text()
        const trimmed = raw.trim().toLowerCase()

        if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
            return makeMissingAssetsStatus(
                `Manifest request returned HTML instead of JSON. Vite usually does this when ${BOX3D_BRIDGE_MANIFEST_URL} does not exist and it falls back to index.html.`
            )
        }

        let manifest: unknown
        try {
            manifest = JSON.parse(raw)
        } catch {
            return {
                available: false,
                headline: 'Bridge manifest is present but unreadable.',
                details: [
                    `Manifest at ${BOX3D_BRIDGE_MANIFEST_URL} is not valid JSON.`,
                    'Regenerate the bridge artifacts before trusting the beta route.'
                ],
                manifestUrl: BOX3D_BRIDGE_MANIFEST_URL,
                expectedFiles: getExpectedBox3DBridgeFiles()
            }
        }

        if (!isBridgeManifest(manifest)) {
            return {
                available: false,
                headline: 'Bridge manifest is present but invalid.',
                details: [
                    `Manifest at ${BOX3D_BRIDGE_MANIFEST_URL} must include version, moduleUrl, and wasmUrl.`,
                    'Regenerate the bridge artifacts before trusting the beta route.'
                ],
                manifestUrl: BOX3D_BRIDGE_MANIFEST_URL,
                expectedFiles: getExpectedBox3DBridgeFiles()
            }
        }

        return {
            available: true,
            headline: `Bridge manifest detected for Box3D ${manifest.version}.`,
            details: [
                `JS module: ${manifest.moduleUrl}`,
                `WASM binary: ${manifest.wasmUrl}`,
                manifest.builtAt ? `Built at: ${manifest.builtAt}` : 'Built timestamp not provided.'
            ],
            manifestUrl: BOX3D_BRIDGE_MANIFEST_URL,
            expectedFiles: getExpectedBox3DBridgeFiles(),
            manifest
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
            available: false,
            headline: 'Bridge probe failed before loading physics.',
            details: [
                `Fetch error: ${message}`,
                'If this happens in the browser, confirm the dev server is running and the bridge manifest exists under public/box3d/.'
            ],
            manifestUrl: BOX3D_BRIDGE_MANIFEST_URL,
            expectedFiles: getExpectedBox3DBridgeFiles()
        }
    }
}

function loadBridgeScript(moduleUrl: string): Promise<void> {
    if (window.createMarbleBox3DBridgeModule) return Promise.resolve()
    if (bridgeScriptPromise) return bridgeScriptPromise

    bridgeScriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[data-box3d-bridge="${moduleUrl}"]`)
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true })
            existing.addEventListener('error', () => reject(new Error(`Failed to load ${moduleUrl}`)), { once: true })
            return
        }

        const script = document.createElement('script')
        script.src = moduleUrl
        script.async = true
        script.dataset.box3dBridge = moduleUrl
        script.addEventListener('load', () => resolve(), { once: true })
        script.addEventListener('error', () => reject(new Error(`Failed to load ${moduleUrl}`)), { once: true })
        document.head.appendChild(script)
    })

    return bridgeScriptPromise
}

export async function loadBox3DBridgeModule(): Promise<MarbleBox3DBridgeExports> {
    if (bridgeModulePromise) return bridgeModulePromise

    bridgeModulePromise = (async () => {
        const status = await loadBox3DBridge()
        if (!status.available || !status.manifest) {
            throw new Error(status.headline)
        }

        await loadBridgeScript(status.manifest.moduleUrl)

        const factory = window.createMarbleBox3DBridgeModule
        if (!factory) {
            throw new Error('Box3D bridge script loaded, but the module factory was not exposed on window.')
        }

        const module = await factory({
            locateFile: path => path.endsWith('.wasm') ? status.manifest!.wasmUrl : path
        })

        const bridge: MarbleBox3DBridgeExports = {
            manifest: status.manifest,
            module,
            bridgeVersion: module.cwrap('marble_box3d_bridge_version', 'number', []),
            health: module.cwrap('marble_box3d_bridge_health', 'number', []),
            worldCreate: module.cwrap('marble_box3d_world_create', 'number', ['number', 'number', 'number']),
            worldDestroy: module.cwrap('marble_box3d_world_destroy', null, ['number']) as (...args: number[]) => number,
            worldStep: module.cwrap('marble_box3d_world_step', 'number', ['number', 'number', 'number']),
            createStaticBox: module.cwrap('marble_box3d_create_static_box', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
            createDynamicSphere: module.cwrap('marble_box3d_create_dynamic_sphere', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
            createHeightfield: module.cwrap('marble_box3d_create_heightfield', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
            bodyDestroy: module.cwrap('marble_box3d_body_destroy', null, ['number']) as (...args: number[]) => number,
            bodyApplyTorque: module.cwrap('marble_box3d_body_apply_torque', null, ['number', 'number', 'number', 'number']) as (...args: number[]) => number,
            bodyApplyForceToCenter: module.cwrap('marble_box3d_body_apply_force_to_center', null, ['number', 'number', 'number', 'number']) as (...args: number[]) => number,
            bodyApplyLinearImpulseToCenter: module.cwrap('marble_box3d_body_apply_linear_impulse_to_center', null, ['number', 'number', 'number', 'number']) as (...args: number[]) => number,
            bodyGetLinearVelocity: module.cwrap('marble_box3d_body_get_linear_velocity', 'number', ['number', 'number']),
            bodySetLinearVelocity: module.cwrap('marble_box3d_body_set_linear_velocity', null, ['number', 'number', 'number', 'number']) as (...args: number[]) => number,
            bodyGetAngularVelocity: module.cwrap('marble_box3d_body_get_angular_velocity', 'number', ['number', 'number']),
            bodySetAngularVelocity: module.cwrap('marble_box3d_body_set_angular_velocity', null, ['number', 'number', 'number', 'number']) as (...args: number[]) => number,
            bodySetDamping: module.cwrap('marble_box3d_body_set_damping', null, ['number', 'number', 'number']) as (...args: number[]) => number,
            readBodyTransform: module.cwrap('marble_box3d_read_body_transform', 'number', ['number', 'number']),
            worldRaycast: module.cwrap('marble_box3d_world_raycast', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
            bodySetTransform: module.cwrap('marble_box3d_body_set_transform', null, ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']) as (...args: number[]) => number
        }

        if (bridge.health() !== 1) {
            throw new Error('Box3D bridge health check failed.')
        }

        return bridge
    })()

    return bridgeModulePromise
}
