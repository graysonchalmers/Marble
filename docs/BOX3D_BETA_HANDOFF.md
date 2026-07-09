# Box3D Physics Integration: Parity Completed

Date: 2026-07-06

The Box3D physics simulator has reached full UI and gameplay parity with the legacy Cannon version. All system loops, controls, timers, HUD overlays, scoreboard entries, and spatial 3D audio are fully aligned and identical.

---

## 🏗️ Current State & Accomplishments

1.  **Unified Frontend Layout:**
    *   Renamed `Box3DBetaPlaceholder.tsx` to `Box3DScene.tsx`.
    *   Removed debug panel overlays, allowing the Canvas to run fullscreen.
    *   Wired `Box3DScene` into `src/App.tsx` inline inside the standard React layout.
    *   Both player and enemy positions are synced to the Zustand store at 30Hz, enabling full `MiniMap` tracking.
2.  **Neutral Game Loops:**
    *   Added a `<Box3DGameLoopDriver>` component inside the scene.
    *   Instantiates neutral `GameLoop` and `SonarSystem` instances.
    *   Ticks the rules engine (`rulesSystem.tick`) and sonar audio (`sonarSystem.tick`) every frame, driving the start/countdown screen, scoreboard timer, and spatial sound listener updates reactively.
3.  **Lighting and Atmospheric Parity:**
    *   Directional lighting follows the player sphere at an offset of `[17.5, 28, 14]` matching the native Sokol sun direction.
    *   Uses a `2048x2048` shadow map with a tight `40`-unit frustum that moves dynamically with the player, keeping shadows crisp.
    *   Added Drei `<Sky>` (Hosek-Wilkie atmospheric model) and `<Environment preset="sunset" />` for high-quality ambient lighting.
    *   Scene background and fog match the sky horizon color (`#cbdbe6`).
4.  **Verification Pass:**
    *   All 29 tests (including the physical integration test `Box3DWorldIntegration.test.ts`) pass green.
    *   Vite builds compile cleanly without any type check warnings.

---

## 🛠️ How to Swap Default Physics Engines

Currently, the default physics engine is Cannon. You can run the Box3D track by adding `?physics=box3d` to the URL query string (or running the `Launch - Box3D Beta.bat` launcher).

To make Box3D the default physics engine in the future:
1.  Open `src/physics/runtime.ts` and change the default backend returned by `getRuntimePhysicsBackend()` to `'box3d'`:
    ```typescript
    export function getRuntimePhysicsBackend(searchString: string): PhysicsBackend {
      const params = new URLSearchParams(searchString)
      const val = params.get('physics')
      if (val === 'box3d' || val === 'cannon') {
        return val
      }
      return 'box3d' // Change this from 'cannon' to 'box3d'
    }
    ```
2.  All assets, menus, and game modes will automatically boot into Box3D mode across all launchers.

---

## 🧪 Verification Commands

To check project health:
*   Run tests:
    ```bash
    npm run test
    ```
*   Run production build:
    ```bash
    npm run build
    ```

---

## 📱 Mobile/iPad Feasibility Notes (added 2026-07-09)

Question that prompted this: could we get the upstream Box3D reference "sandbox"/testbed running on an iPad?

**Source confirmed:** `Box3D` = [erincatto/box3d](https://github.com/erincatto/box3d) — Erin Catto's (Box2D author) open-source 3D physics engine, C17. This is the upstream repo the build script pulls from at `C:\Users\Grayson\OneDrive\Projects - Personal\z-Git\Git-box3d`.

**Two different things live in that repo — they have very different mobile stories:**

1. **The engine itself (`src/`)** — portable C17, no OS/rendering dependency. This is what our `box3d_bridge.c` already wraps and compiles to WASM via Emscripten. This part is *already* mobile-web-compatible — it's exactly what our beta backend runs today, and it works in any WebGL2 browser including iPad/iPhone Safari and Android Chrome.
2. **The upstream samples/testbed app (`samples/`)** — a **native desktop app**, not portable to iPad as-is. It renders with Sokol (D3D11 on Windows, Metal on macOS, OpenGL 4.3 on Linux) plus Dear ImGui for the debug UI. No WebAssembly/Emscripten build ships in the repo, no iOS/Android target. Sokol itself has a general Emscripten/WebGL backend, but Box3D's build scripts don't wire it up — porting the actual upstream testbed to run in a browser (and thus an iPad) would be a nontrivial side project (custom Emscripten toolchain + web/touch input layer for Dear ImGui), not something worth doing given we already have the correct integration point in our own `Box3DWorld.ts` adapter.

**Upstream sample files, for reference if we want to port specific demo behaviors into our own R3F sandbox later:**
`sample_bodies.cpp`, `sample_character.cpp`, `sample_collision.cpp`, `sample_compound.cpp`, `sample_continuous.cpp`, `sample_determinism.cpp`, `sample_events.cpp`, `sample_geometry.cpp`, `sample_joint.cpp`, `sample_manifold.cpp`, `sample_mesh.cpp`, `sample_ragdoll.cpp`, `sample_replay.cpp`, `sample_robustness.cpp`, `sample_shapes.cpp`, `sample_stacking.cpp`, `sample_tree.cpp`, `sample_world.cpp`, plus `sample_benchmark.cpp` and `sample_issues.cpp` (regression repros, probably not useful to port).

**Recommendation:** don't chase the native testbed. Continue the existing `BOX3D_BETA_PLAN.md` Phase C/D path — recreate whichever upstream demo scenes are useful (joints, stacking, ragdoll, compound shapes) as R3F components reading transforms from our own WASM bridge. That already runs on iPad for free since it's the same web page the marble game runs on. No mobile-specific engine work needed — just decide which upstream demo scenes are worth reproducing as a "physics playground" screen.
