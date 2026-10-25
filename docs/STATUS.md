# 🧭 Status — Game-Marble (v2)

_Last updated: 2026-10-25 · split; history archived_

> Legend kept from the old doc: ✅ verified (gate evidence recorded) · 🔌 wired (code exists, no gate) · ⬜ not started. No "should work."
> Everything below is re-checked against `src/state/persistence.ts`, `package.json` and the 2026-10-25 gate run unless marked **(unverified)**. For anything else, the full pre-split text (sessions 1-34, 2026-07-02 to 2026-07-23) is in `handoff-log/archive/STATUS-snapshot-2026-10-25.md`.

## 🎯 Current state

**Branch/base:** `v2` (HEAD `a681ccb`, "fix(settings): SCHEMA_VERSION 14 after merging two 12->13 bumps"). Stack: React 19 + R3F + three + zustand, Box3D physics as WASM (`public/box3d/box3d_bridge.{js,wasm}`), Vite single-file build.

**Commands (package.json):** `npm run dev` · `npm test` (vitest run) · `npm run build` (`tsc -b && vite build`) · `npm run lint`. Windows launchers at repo root: `Launch - Box3D Beta.bat`, `Launch - Latest Version.bat`, `Launch - Game Picker.bat`.

**Gates at `a681ccb` (Windows, 2026-10-25):** ✅ `npm test` 157 passed / 2 skipped · ✅ `npm run build` exit 0, single-file `dist/index.html` ~1.32 MB. Not re-run on the Envy.

**What exists (all ✅ in code; feel items still need Grayson's playtest):**
- Sim: fixed-step loop, Box3D physics, velocity-driven player and enemy movement (torque model retired), height-derived jump, F9/replay determinism tests. Tag detection is a swept closest-approach (`systems/sim/sweptTag.ts`, `RULES.tagSlack` 0.25, teleport guard `tagMaxSweep` 5u).
- Cycle B colliders (committed and merged 2026-10-25, was Legion WIP): true rotated static boxes (cube/crumble tilt to terrain normal), a smooth convex-hull pyramid, a cylinder column collider. Needed two new WASM primitives (`marble_box3d_create_static_pyramid`, `..._static_cylinder`).
- Render subtraction (2026-10-07): `occlusionMode` default is `"cylinder"` (`RenderSubtraction.tsx`, `SubtractionSandbox`, `src/systems/render/subtractionVolume.ts`, `docs/RENDER-SUBTRACTION.md`). Other modes: wireframe, x-ray, silhouette, off. Old `"ghost"` saves migrate to cylinder.
- Enemy AI (v2, 2026-10-11): uses only the player's last-seen position and velocity. Belief-map search sits behind `SimParams.beliefSearch` (toggle: Dev Tools > Debug Visuals; `docs/BELIEF_SEARCH.md`, code `src/systems/ai/beliefSearch.ts`).
- Replay fix (2026-10-11): never step a sim whose Box3D world is destroyed. `Box3DWorld.isDestroyed` is set by `destroy()` only; `src/components/game-beta/simTick.ts` returns on it. See `handoff-log/2026-10-11-replay-stale-sim.md`.
- Also in place: clutter (props, crumble/topple scenery, columns, pyramids), settings wired to the Box3D keys, live Environment rebuild, audio, time-alive scoring with top-10 records.

**Settings persistence (`src/state/persistence.ts`):** `SCHEMA_VERSION = 14`. Two parallel 12->13 bumps were merged on 2026-10-25; the ghost->cylinder `occlusionMode` migration gates on `version < 14` (line ~136, before the generic migrate block).

**Standing traps:**
- Persistence merge gotcha: saved values win the `{...DEFAULT_SETTINGS, ...saved}` merge. Changing a default is a no-op for anyone with a save unless the migration does `delete saved.<key>` for it (pattern used at v7, v8, v11, v12). Always bump `SCHEMA_VERSION` and add a `version < N` branch; parallel branches bumping the same number collide on merge (as happened for 13).
- WASM bridge: new collider primitives need a rebuild of the Box3D bridge (emscripten + `erincatto/box3d@aaa795e`, last done in a cloud container, session 34). After a rebuild F1 timing shifted 1.767s -> 1.750s from toolchain float drift; F9/replay stay bit-identical within one build. The old doc names `native/build-box3d-bridge.sh`, but `native/` is **not present on `v2` (unverified where it lives)**: check the snapshot and `public/box3d/bridge-manifest.json` first.
- Windows/CRLF: `.gitattributes` normalizes to LF (`.bat`/`.ps1` CRLF). A big "all files modified" diff is usually CRLF churn: confirm with `git diff --ignore-cr-at-eol` before trusting it (it was NOT pure churn once, 2026-07-14).
- Stale zero-byte `.git/index.lock`: move it aside, do not fight it.
- Box3D `worldRaycast` has no body filter, so props can briefly block enemy line-of-sight.
- Dynamic bodies are spheres only (props use a faceted visual over a sphere collider).
- `docs/TUNING.md` holds v1/Cannon values; `systems/sim/tuning.ts` holds the live Box3D beta values (gravity preset `blend` default). They differ on purpose.
- Terrain has one source of truth: `utils/terrain.getTerrainHeight`.

**Owed / unproven:**
- 🔌 Phase 3 performance gate: no perf-HUD screenshot or profiler capture ever recorded.
- Playtest (feel) never confirmed for: pyramid ramp/launch, round columns, tilted cube/crumble colliders, topple/collapse drama, the cylinder occlusion default, belief-search enemy behavior. Prior open bugs are listed in the snapshot (sessions 17-19, 24-34); treat them as **(unverified)** until replayed.
- Phase 4 (art direction pass) ⬜ not started.

**Working rules (unchanged):** docs are the spec; verify before advancing (record gate evidence here); port earned tuning verbatim; game must boot after every phase; log deviations; end each session with this file accurate.

## 📌 Where we stopped
2026-10-25: Cycle B and render subtraction merged onto `v2` together with the belief-search and replay fix; settings schema settled at 14; Windows gates green at `a681ccb`. This file was then split because it had grown to 134 KB.

## ▶️ Next concrete step
Run `npm test` and `npm run build` on the Envy (not yet done there), then have Grayson playtest the Cycle B colliders and the cylinder occlusion default; record results under Current state.

## ❓ Open questions
- Where does the WASM build script live now (`native/` is absent on `v2`)?
- Keep belief search opt-in, or make it the default once playtested?
- Which of the old playtest bugs from sessions 17-34 are still live?

## 🗂️ Changed this session
- Split oversized STATUS.md; full prior text in handoff-log/archive/STATUS-snapshot-2026-10-25.md

---
📜 History: handoff-log/ (archive/ holds the pre-split snapshot)
