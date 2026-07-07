# Native Box3D Bridge

This folder will hold the narrow C ABI that exports only the Box3D operations Marble needs in the browser.

Planned native source:

- `box3d_bridge.c`

Planned generated artifacts:

- `box3d_bridge.js`
- `box3d_bridge.wasm`
- optional TypeScript declarations for the loader

Do not bind the full Box3D API. Keep this bridge small enough to test and replace.


## Build

From the repo root:

```powershell
.\src\physics\box3d\native\build-box3d-bridge.ps1
```

The script expects the Box3D source checkout at:

```text
C:\Users\Grayson\OneDrive\Projects - Personal\z-Git\Git-box3d
```

It emits `bridge-manifest.json`, `box3d_bridge.js`, and `box3d_bridge.wasm` into `public\box3d\`.
