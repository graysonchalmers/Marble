# Box3D Beta Handoff

## Current State

Date: 2026-07-06

What is implemented:

- `Launch - Game Picker.bat` selects between the default build and `?physics=box3d` beta route.
- `Launch - Latest Version.bat` opens the default current build.
- `Launch - Box3D Beta.bat` opens the beta route directly.
- The Box3D beta route now performs a real bridge probe instead of showing a generic placeholder.
- The bridge loader expects generated artifacts under `public/box3d/`.
- Headless tests cover route parsing and bridge manifest detection.

What is now unblocked:

- Emscripten 6.0.2 is installed through Scoop.
- `emsdk activate latest --permanent` has registered the user environment; newly opened terminals should see `emcc` on PATH.
- The bridge source now compiles with Emscripten against the local Box3D checkout.
- Generated bridge artifacts exist under `public/box3d/`.

## Expected Bridge Artifacts

Place these under `public/box3d/`:

- `bridge-manifest.json`
- `box3d_bridge.js`
- `box3d_bridge.wasm`

Suggested manifest shape:

```json
{
  "version": "0.1.0",
  "moduleUrl": "/box3d/box3d_bridge.js",
  "wasmUrl": "/box3d/box3d_bridge.wasm",
  "builtAt": "2026-07-06T22:00:00Z",
  "sourceRepo": "C:/Users/Grayson/OneDrive/Projects - Personal/z-Git/Git-box3d"
}
```

## Build Handoff

Prerequisites:

- Emscripten installed and `emcc` available on PATH.
- Local Box3D repo available at `C:\Users\Grayson\OneDrive\Projects - Personal\z-Git\Git-box3d`.

Next concrete implementation step:

1. Extend `loadBox3DBridge()` from manifest probing to actual module loading.
2. Wrap the exported C ABI in `Box3DWorld`.
3. Add a falling-sphere smoke test scene driven by the real WASM bridge.
4. Keep current V2 as the default route while the beta scene is verified.

## Native Bridge Scope

First bridge should export only:

- version/health check
- world create/destroy
- world step
- create one static box body
- create one dynamic sphere body
- read sphere transform into a flat output buffer

Do not bind the full Box3D API yet.

## Verification Gate

Current verification:

- `npm run test` green: 7 files / 26 tests.
- `npm run build` green: Vite production build completed.
- Generated artifacts: `public/box3d/bridge-manifest.json`, `public/box3d/box3d_bridge.js`, `public/box3d/box3d_bridge.wasm`.

Before moving beyond smoke-test stage:

- `npm run test` green
- `npm run build` green
- Current V2 still boots at default route
- Beta route detects manifest and reports bridge metadata
- A single sphere visibly falls onto a static surface in the beta route


