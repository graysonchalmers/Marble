import { describe, expect, it } from 'vitest'
import { BOX3D_BRIDGE_MANIFEST_URL, loadBox3DBridge } from './box3dBridge'

describe('loadBox3DBridge', () => {
    it('reports missing assets when the manifest is absent', async () => {
        const status = await loadBox3DBridge(async () => ({
            ok: false,
            status: 404,
            async text() {
                return ''
            }
        }))

        expect(status.available).toBe(false)
        expect(status.manifestUrl).toBe(BOX3D_BRIDGE_MANIFEST_URL)
        expect(status.headline).toContain('not present')
    })

    it('treats html fallback as a missing manifest instead of a JSON parse error', async () => {
        const status = await loadBox3DBridge(async () => ({
            ok: true,
            status: 200,
            async text() {
                return '<!doctype html><html><body>fallback</body></html>'
            }
        }))

        expect(status.available).toBe(false)
        expect(status.headline).toContain('not present')
        expect(status.details[0]).toContain('returned HTML')
    })

    it('accepts a valid manifest', async () => {
        const status = await loadBox3DBridge(async () => ({
            ok: true,
            status: 200,
            async text() {
                return JSON.stringify({
                    version: '0.1.0',
                    moduleUrl: '/box3d/box3d_bridge.js',
                    wasmUrl: '/box3d/box3d_bridge.wasm',
                    builtAt: '2026-07-06T22:00:00Z'
                })
            }
        }))

        expect(status.available).toBe(true)
        expect(status.headline).toContain('0.1.0')
    })

    it('reports invalid manifests clearly', async () => {
        const status = await loadBox3DBridge(async () => ({
            ok: true,
            status: 200,
            async text() {
                return JSON.stringify({ version: '0.1.0' })
            }
        }))

        expect(status.available).toBe(false)
        expect(status.headline).toContain('invalid')
    })
})
