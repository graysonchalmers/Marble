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
