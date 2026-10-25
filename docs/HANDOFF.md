# 🧭 Session Handoff — Game-Marble (Box3D physics beta)
_Last updated: 2026-10-25 · handoff split; history archived_

> Read `docs/STATUS.md` first: live phase/priority stack, verification gates, session log (last entry seen: session 34, 2026-07-23). This file is the durable architecture reference. Treat anything dated after session 30 here as unverified; STATUS wins on conflicts.

## 🎯 Current state
- Box3D (WASM, `erincatto/box3d@aaa795e`) is the DEFAULT physics backend since session 29 (2026-07-12). `?physics=cannon` selects the retired Cannon scene (a bare Cannon boot renders black 3D with no console errors).
- Gameplay logic is headless in `systems/sim/MarbleSim.ts`; `Box3DScene.tsx` is render + glue only. Determinism (F8/F9) must hold: render/FX systems read sim state and events but never feed back into `MarbleSim`.
- Data flow: React/useFrame -> `Box3DWorld.ts` (TS adapter, `box3dBridge.ts`) -> C cwrap ABI -> `box3d_bridge.js`/WASM -> Box3D. Transforms, velocities and raycast hits are copied into pre-allocated WASM heap slices.
- Bridge (`box3d_bridge.c`): bodies are opaque `MarbleBox3DBody` pointers; heightfield data is registry-tracked and freed on world destroy; `marble_box3d_body_destroy` calls `b3DestroyBody` before freeing the wrapper (fixed session 10).
- Scene: native `world.raycastClosest` for vision and grounding (grounded if fraction <= `(size+0.2)/(size+0.4)`); `Box3DGameLoopDriver` ticks `GameLoop`, `rulesSystem`, `sonarSystem`; visual meshes lerp/slerp against physics transforms; pause freezes sim and interpolation via `isPaused`.
- Movement: velocity-driven is the only model (torque/force retired session 12). `applyVelocityControl` and `applyEnemyVelocityControl` drive horizontal velocity toward the input/AI heading; spin slaved `omega = (v_z/r, 0, -v_x/r)`. Knobs in `tuning.ts` `MOVEMENT`/`ENEMY`, live-overridable via `SimParams` (`params.X ?? MOVEMENT.X`). Forward = -Z, right = +X. Coast drift (`playerDrift`), downhill roll (`downhillRoll`, from the analytic `getTerrainHeight` gradient, NOT the raycast normal, because the WASM heightfield raycast returns a flat up-normal), height-based jump (`jumpHeight`, default 1.8). `PLAYER.friction`, preset friction and `jumpImpulse` are vestigial.
- Post-tag settle (session 30): after the tag, `MarbleSim.step` runs `RULES.tagSettleFrames` (16) more steps, then fires `onCaught`; `Box3DScene` sets gameover on `onCaught` (not `onTag`) so replays end on the visible catch.
- Render/FX: see-through cubes (`systems/render/occlusion.ts` + `CubeOcclusion.tsx`; modes ghost/wireframe/xray/silhouette/off via `occlusionMode`), pooled single-draw-call particles (`systems/fx/ParticleSystem.ts`; add effects via new `emit*` calls), sim events `onImpact`/`onLand` (thresholds in `tuning.ts` `FX`), play-feel presets (`PLAYFEEL_PRESETS`, `applyPlayfeelPreset`; a preset can change `physicsPreset`, which rebuilds the arena).
- Obstacles and polish landed sessions 14-27 (columns, crumble blocks, smashable/toppling columns, reflective ball with Fresnel clearcoat, fading path trails, replay scrub/slow-mo, orbit camera). Session 28 reverted live play to the tight chase camera (orbit-follow left the ball off-center). Details: snapshot and STATUS.
- Math: heightfields are row-major (`z * countX + x`); body transform offset `[-((WIDTH-1)*SCALE)/2, 0, -((DEPTH-1)*SCALE)/2]` (= `[-63, 0, -63]`) aligns visual and collision.
- Build WASM (Windows, Emscripten + PowerShell): `powershell -ExecutionPolicy Bypass -File .\src\physics\box3d\native\build-box3d-bridge.ps1` -> outputs `box3d_bridge.js` and `.wasm` in `public/box3d`. Since session 20b the bridge also rebuilds in a cloud container (emscripten + box3d@aaa795e).
- Last gates recorded in this doc (session 30): `tsc` clean, vitest 132/132, build 2.524 MB. Session 34 gate numbers are in STATUS.

### Standing traps
- `persistence.ts` `migrate()` returns `{...DEFAULT_SETTINGS, ...saved}` (saved wins), so changed defaults only reach users via a `SCHEMA_VERSION` bump (session 22 diagnosis, do not re-diagnose; session 24 used this for size changes).
- Windows clone `C:\Projects-local\Game-Marble` shows ~50 phantom "modified" files from CRLF drift and may have a stale `.git/index.lock`. Close git tools, remove the lock, check line-endings before trusting any diff.
- Obstacle colliders: session 34 (per STATUS) added rotated static boxes and cylinder colliders; older notes about axis-aligned-only colliders in the snapshot are superseded.
- Local state at split time: in the main checkout, `docs/` and several `src/` dirs are untracked on `main`; this branch only adds the handoff files.

## 📌 Where we stopped
Session 34 (2026-07-23, per STATUS): Cycle B shipped real rotated + cylinder colliders (smooth pyramids, tilted cube/crumble colliders, round columns) via an in-cloud WASM rebuild. This file was last hand-updated at session 30 (2026-07-12).

## ▶️ Next concrete step
Read `docs/STATUS.md`, confirm the session 34 gate results, then continue from its priority stack. Optional backlog: FX polish (per-particle size via ShaderMaterial, enemy trail, jump puff via `onJump`), debounce the live arena rebuild (~250 ms) if slider drags stutter.

## ❓ Open questions
- Whether the BOX3D_BETA_HANDOFF.md / PLAN.md docs duplicate this one (not checked).
- Session 31-34 details were not re-verified here; see STATUS.

## 🗂️ Changed this session
- Split oversized handoff; full prior text in handoff-log/archive/HANDOFF-snapshot-2026-10-25.md

---
📜 Full session history: handoff-log/ (archive/ holds the pre-split snapshot)
