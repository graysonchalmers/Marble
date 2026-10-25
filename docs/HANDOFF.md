# 🧭 Session Handoff — Game-Marble (v2)

_Last updated: 2026-10-25 · handoff split; history archived_

> Read `docs/STATUS.md` first: it is the authoritative current state and gate ledger. This file orients a new session (run/test/build, where things live, traps, what is owed). It does not repeat STATUS. Anything not re-verified lives in `handoff-log/archive/HANDOFF-snapshot-2026-10-25.md` (the full pre-split text, sessions 8-30, July 2026); treat facts from it as **(unverified)** until checked.

## 🎯 Current state

- **Branch:** `v2` on both machines (Envy and Legion). The old `main` branch is a stale v1; do not build on it. Remote work lands on `v2`.
- **Stack:** React 19 + R3F + three + zustand; Box3D physics as WASM; Vite single-file build. The game picks Box3D by default (`?physics=cannon` selects the retired Cannon scene).
- **Gates (2026-10-25, `a681ccb`, Windows):** `npm test` 157 passed / 2 skipped; `npm run build` exit 0. Not yet run on the Envy. Details and shipped-feature list: `docs/STATUS.md`.
- **Settings schema:** `SCHEMA_VERSION = 14` in `src/state/persistence.ts`.

**Run / test / build** (from the repo root, absolute paths):
- `npm run dev` (Vite dev server), `npm test` (vitest run), `npm run build` (`tsc -b && vite build`), `npm run lint`.
- Windows launchers at the root: `Launch - Box3D Beta.bat`, `Launch - Latest Version.bat`, `Launch - Game Picker.bat`.
- On the Envy run builds and full test suites through the shared queue: `~/Projects/_agent-commons/tools/envy-heavy -n <name> -- <cmd>`.

**Where things live:**
- Sim (headless, authoritative for gameplay): `src/systems/sim/MarbleSim.ts`; live tuning constants: `src/systems/sim/tuning.ts` (`MOVEMENT`, `ENEMY`, `RULES`, `CRUMBLE`, `FX`, play-feel presets). `Box3DScene` is render + glue only.
- Box3D adapter: `src/physics/box3d/` (`Box3DWorld.ts`, `box3dBridge.ts`).
- WASM bridge source and build scripts: `src/physics/box3d/native/` (`box3d_bridge.c`, `build-box3d-bridge.sh` / `.ps1`, `README.md`). Output goes to `public/box3d/` (`box3d_bridge.js`, `box3d_bridge.wasm`, `bridge-manifest.json`).
- Render: `src/components/game-beta/` (scene, `ObstacleOcclusion`, `RenderSubtraction`, particles, path trails); pure render helpers in `src/systems/render/`.
- AI: `src/systems/ai/beliefSearch.ts` (`docs/BELIEF_SEARCH.md`). Terrain has one source of truth: `utils/terrain.getTerrainHeight`.
- Docs in `docs/`: `STATUS.md` (state), `PLAN.md` (phase plan and collider primitive budget), `BOX3D_BETA_PLAN.md`, `BOX3D_BETA_HANDOFF.md`, `RENDER-SUBTRACTION.md`, `BELIEF_SEARCH.md`, `TUNING.md`, `PLAYTEST.md`, `ARCHITECTURE.md`.
- History: `handoff-log/` (dated notes; `archive/` holds the pre-split snapshots of STATUS and this file). Never edit existing handoff-log files.

**Architecture in brief** (still true as of the snapshot, structure unchanged since):
- Fixed-step sim loop in `MarbleSim`; the render layer reads sim state and cosmetic sim events (`onImpact`, `onLand`, `onTag`, `onCaught`) and never feeds back, so F8/F9 determinism and replay stay intact.
- Movement is velocity-driven for player and enemy (torque and force models were retired). Feel knobs are live through `SimParams` (`params.X ?? CONST`), so defaults in `tuning.ts` apply when a caller omits them.
- Tag: swept closest-approach fires `onTag` (bonk), then `RULES.tagSettleFrames` (16) more steps run before `onCaught` flips to game over, so replay captures the catch.
- Replay: recorded inputs; seeking fast-forwards a fresh sim (WASM cannot rewind), muting events. Never step a sim whose Box3D world is destroyed (`Box3DWorld.isDestroyed`, see `handoff-log/2026-10-11-replay-stale-sim.md`).
- Heightfield alignment: Box3D grids are row-major (`z * countX + x`); the terrain body is offset by `[-((WIDTH-1)*SCALE)/2, 0, -((DEPTH-1)*SCALE)/2]` (about `[-63, 0, -63]`) to match the visual mesh.
- Native bodies: `marble_box3d_body_destroy` destroys the native body before freeing the wrapper (session 10 fix); callers destroy each pointer once.

**Standing traps:**
- **Persistence merge:** `migrate()` returns `{...DEFAULT_SETTINGS, ...saved}`, so saved values win. Changing a default is a no-op for anyone with a save unless the migration does `delete saved.<key>` (done at v7, v8, v11, v12). Bumping a default on a persisted key means: bump `SCHEMA_VERSION`, add a `version < N` branch.
- **SCHEMA_VERSION collisions:** parallel branches that both bump the same number collide on merge (13 did). Check `origin/v2` for the current number before bumping; the next free value is 15.
- **WASM rebuilds:** new collider primitives need a bridge rebuild (emscripten + `erincatto/box3d@aaa795e`; last done in a cloud container, session 34). F1 timing drifts slightly across toolchains (1.767s to 1.750s); F9/replay stay bit-identical within one build.
- **CRLF:** `.gitattributes` normalizes to LF (`.bat`/`.ps1` stay CRLF). An "all files modified" diff is usually CRLF churn: check `git diff --ignore-cr-at-eol` before trusting it, and never mass-commit it (it was not pure churn once, 2026-07-14).
- **Stale `.git/index.lock`:** zero-byte lock files get moved aside, not fought.
- Box3D `worldRaycast` has no body filter, so props can briefly block enemy line of sight. Dynamic bodies are spheres, except crumble debris (dynamic boxes). The heightfield raycast returns a flat up-normal, so slope maths uses the analytic `getTerrainHeight` gradient.
- `docs/TUNING.md` holds v1/Cannon values; `tuning.ts` holds the live Box3D beta values. They differ on purpose.
- New environment/enemy sliders rebuild the WASM world live; if dragging stutters, debounce the rebuild (~250 ms).

## 📌 Where we stopped
2026-10-25: Cycle B colliders and render subtraction merged onto `v2` with belief search and the replay fix; schema settled at 14; Windows gates green at `a681ccb`. STATUS.md and this file were then split because both had grown huge (STATUS 134 KB, this file 40 KB).

## ▶️ Next concrete step
On the Envy: `git fetch`, confirm the checkout is `v2` at or past `a681ccb`, then run `npm test` and `npm run build` through `envy-heavy` and record the result in STATUS.md under Current state. Then ask Grayson to playtest the Cycle B colliders (tilted cube/crumble, pyramid, cylinder column) and the cylinder occlusion default.

## ❓ Open questions
- Keep belief search opt-in, or make it the default once playtested?
- Which playtest bugs from sessions 17-34 are still live? (Listed in `handoff-log/archive/STATUS-snapshot-2026-10-25.md`; unverified until replayed.)
- Phase 3 performance gate: no perf-HUD screenshot or profiler capture was ever recorded (owed). Phase 4 (art direction pass) not started.
- Backlog ideas from the snapshot, none scheduled: modular enemy strategies (flank/ambush/patrol), FX polish (per-particle size, jump puff), stacking/toppling brick columns (many small dynamic boxes).

## 🗂️ Changed this session
- Split oversized HANDOFF.md; full prior text in handoff-log/archive/HANDOFF-snapshot-2026-10-25.md

---
📜 History: handoff-log/ (archive/ holds pre-split snapshots)
