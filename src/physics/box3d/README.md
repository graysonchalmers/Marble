# Box3D Beta Backend

This folder is the browser-facing TypeScript side of the Box3D beta.

Box3D itself is a C17 library. The beta should not expose the full native API to React components. Instead, `Box3DWorld.ts` should wrap a narrow game-specific bridge that handles world creation, fixed stepping, body creation, transform batching, and raycasts.

Expected flow:

1. Build the native bridge in `native/` with Emscripten.
2. Load the generated WASM/JS artifact from this folder or `public/`.
3. Use `Box3DWorld` from beta scene/components only.
4. Keep current Cannon code as the default runtime until parity gates pass.

