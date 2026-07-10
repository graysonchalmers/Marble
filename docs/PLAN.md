# 🗺️ PLAN — V2 Build Plan

**Strategy: Strangler-fig refactor, not rewrite.**
V2 starts from v1's code (this branch already contains it). We extract systems one at a time while the game stays playable at every commit. Rationale: the sonar + AI feel is tuned, earned data — a fresh rebuild re-derives it at high risk for zero player-facing gain.

Rule of thumb: **the game must boot and be playable after every phase.** If a phase ends with a broken game, the phase isn't done.

**Verification framework (added 2026-07-02):** every phase ends with an exit gate — concrete evidence recorded in [STATUS.md](STATUS.md) — and the next phase doesn't open until the gate is green. STATUS.md is the living truth (✅ verified / 🔌 wired / ⬜ not started); start every session by reading it. v1's earned tuning values are frozen in [TUNING.md](TUNING.md); the "feels identical" criterion is made testable by the feel-invariant list in STATUS.md.

---

## Phase 0 — Scaffold (½ day) 🧹
- [x] v2 branch + launcher (done) — originally a nested git worktree, migrated to a standalone clone at `C:\Projects-local\Game-Marble` on 2026-07-02 (see Handoff Notes below)
- [x] Create folder skeleton from `ARCHITECTURE.md` (empty modules OK) — 2026-07-02
- [x] Add vitest + one trivial test to prove the harness — 8 real tests (loop + event bus), 2026-07-02
- [x] Add `engine/loop.ts` fixed-timestep driver (not yet wired) — plus `engine/events.ts`, 2026-07-02

**Exit gate:** `npm run test` green (≥1 real test) · `npm run build` clean · game unchanged, plays identically to v1. Record in STATUS.md.

## Phase 1 — Extract Systems (2-4 sessions) 🔧
Order matters — least entangled first:

1. **AI** → `systems/ai/` — `EnemyAI.ts` is already pure functions; move + unit test state transitions
2. **Rules** → `systems/rules/` — game state machine out of Scene's useEffects; kill `window.location.reload()` restart
3. **Sonar** → `systems/sonar/` — persistent audio graph, param-only updates; keep v1 tuning as default preset
4. **Store split** → `state/` slices + debounced versioned persistence; migrate `MARBLE_GAME_SETTINGS_V2` key
5. **Wire the loop** — systems tick from `engine/loop.ts`; React components become views reading refs

**Exit gate:** unit tests per extracted system green · feel-invariant suite (STATUS.md F1–F8) green · manual A/B against v1 side by side (5173 vs 5174), feel identical. Record in STATUS.md.

## Phase 2 — Performance (2-3 sessions) ⚡
- [ ] Instanced level geometry; draw-call audit (target < 50)
- [ ] Zero-allocation tick (scratch vector pool); profile GC
- [ ] Quality presets (Low→Ultra) replacing loose graphics toggles
- [ ] Real perf HUD (sim ms / render ms / draws) replacing PerfBridge
- [ ] WebGL fallback for non-WebGPU browsers
- [ ] **Decision gate:** cannon-es vs Rapier benchmark at 10x body count — only switch if wins are big and feel survives

**Exit gate:** 60fps at defaults on mid-range GPU with budget HUD proving it · draw calls < 50 · zero-alloc tick verified in profiler · WebGL fallback boots. Record in STATUS.md.

## Phase 3 — Game Loop Depth (later, keeps v2.0 honest) 🎮
Backlog, ordered by value — pull in only after 2 ships:
- Round structure: best-of-N, escalating enemy speed
- Role-swap tag (you become the hunter)
- Multiple enemies with pack search behavior
- Arena variation seeds

## Phase 4 — Art Direction Pass 🎨
Deferred deliberately (your art background = this phase deserves real attention, not scraps):
- Stylized shading pass, palette system, post stack
- Sonar visualization (optional ripple VFX synced to audio pings)

---

## 🧱 Phase P — Physics Playground / Box3D Flex (2026-07-10)

**Why this phase exists.** Grayson wants the build to *show off* the Box3D physics — knock-around clutter, textured/harder-to-navigate ground, and crashable/crumbling scenery ("flex a little that we're doing something cool"). This phase is the home for physics-showcase world features. It runs alongside the art pass (Phase 4) rather than after it.

### 🎛️ The primitive budget (the constraint that decides everything)

The Box3D WASM bridge (`box3dBridge.ts` → `marble_box3d_*` C funcs) exposes exactly **three collider types**, and every idea here is cheap or expensive purely as a function of which one it maps to:

| Collider | Dynamic? | Rotatable collider? | In these features |
|---|---|---|---|
| **Static box** (`createStaticBox`) | no (immovable) | ❌ no rotation arg | terrain walls, cubes, columns, un-smashed crumble blocks |
| **Dynamic sphere** (`createDynamicSphere`) | ✅ yes | (rolls) | player, enemy, **scattered props (A)**, **crumble debris (C-fake)** |
| **Heightfield** (`createHeightfield`) | no | — | the floor; **one** friction value for the whole field |

**Hard limits that fall out of this:** no dynamic *box*, no rotated/tilted collider, no cylinder/capsule collider, and no per-region friction on the floor. Anything needing those is a **C-bridge change + a WASM recompile** (`emcc` on the host, `build-box3d-bridge.ps1`) — the same out-of-sandbox class as the Known #7 fix. That line is drawn explicitly per feature below.

**Two cross-cutting facts the whole phase inherits:**
1. **Visual ≠ collider is already the house style.** Columns render as cylinders over box colliders; obstacles tilt visually over axis-aligned colliders. We reuse that trick to get shapes the collider can't do (e.g. blocky debris over sphere colliders). Log each as a deviation.
2. **`worldRaycast` returns the closest hit with no body filter.** So any new *body* (a prop, a piece of debris) can block the enemy's line-of-sight ray, its avoidance ray, or the player/enemy ground probe. That's not a bug we can cheaply suppress (the bridge ray takes no ignore-list) — it's a design input. Keep new bodies small/modest so "props are soft cover" reads as emergent, not broken.

---

### 🟢 Feature A — Scattered knock-around props  ·  *dynamic sphere*  ·  **BUILDING NOW (session 19)**

**Goal (Grayson):** "scattered spheres around that get knocked around as the game happens… not quite a ball pit." A little live clutter that reacts, so the world feels physical.

**Design.** Spawn `propCount` (default ~14) extra **dynamic spheres** the same way the player/enemy are made. Positions come from the existing seeded `scatterPoints()` stream (kept outside the spawn-clear radius, mid-ring), so determinism + replay hold. The sim tracks their body pointers and keeps prev/curr transform snapshots (exactly like the enemy); it exposes a `propSnapshots` array. The scene renders them as **one `instancedMesh`** whose matrices update **every frame** from the snapshots (props move — unlike the static cube/column meshes that set matrices once), with `frustumCulled={false}` (the origin-bounding-sphere cull gotcha you already hit).

**Shape / not-a-ball-pit.** Collider is a sphere (only dynamic option), but the *visual* is a chunky, faceted rubble chunk with **varied sizes** (seeded), so it reads as scattered debris/boulders you plow through — not a smooth ball pit. (Long thin box visuals are avoided for the persistent props: a sphere collider under a long box looks wrong *at rest*. Blocky-but-stubby is the sweet spot. The elongated-shard look lives in Feature C where debris is in fast motion.)

**Wiring.** New store key `propCount` (+ maybe `propSize`) → `DEFAULT_SETTINGS` → `SimParams`/config → `SettingsMenu → Environment` slider (rebuild-on-change, same live-rebuild path cubes/columns use). Prop count folds into the replay header so replays rebuild the same clutter.

**Scope cut (named):** props do **not** get their own see-through occlusion, don't emit particle/audio FX on prop-vs-prop hits (player-vs-prop reuses the existing impact events), and use a single shared visual (no per-prop mesh variety beyond scale) for v1.

**Test:** unit-test that prop scatter is seed-deterministic and respects the clear radius (pure, like the cube scatter tests). Verify count in the sim, positions reproduce under a fixed seed.

**Risk (from the raycast fact above):** a prop can briefly block enemy vision (soft cover) or make the enemy swerve. Default count/size chosen conservative; if it makes the enemy feel dumb in playtest, drop the count or shrink the props (tuning, not rework).

---

### 🟤 Feature B — Variable / bumpy floor  ·  *heightfield*  ·  **BUILDING NOW (session 19)**

**Goal (Grayson):** "a slightly more textured floor… some smooth parts, some harder parts, harder for the player and the AI to navigate. Not full physics craziness yet."

**Key finding — two terrain formulas must be unified first.** Terrain height is currently duplicated: `generateTerrainHeights()` in `Box3DScene.tsx` builds the `heights` array that feeds **both** the collider heightfield **and** the render mesh, while `getTerrainHeight()` in `utils/terrain.ts` is the analytic copy the sim trusts for downhill-roll + obstacle placement + tilt. Same formula, two homes → a roughness change to one desyncs the other. **Step 1 is to make `generateTerrainHeights()` sample `getTerrainHeight()`** so there's a single source; then roughness added in one place lands everywhere consistently.

**Design.** Add a **masked roughness** term to `getTerrainHeight`: a low-frequency mask selects "rough zones" (patches), and within them a higher-frequency ripple/mound term roughens the ground; the spawn ring (inside the obstacle clear radius) stays smooth so the start isn't chaos. Amplitude + coverage exposed as a store key (`terrainRoughness`, default modest). Both the player and the AI feel it for real (ground probe + physics + downhill-roll gradient), which *is* the "harder to navigate."

**Resolution reality (decided: keep 64×64).** The heightfield is a **64×64 grid at 2u spacing**, so the collider can only represent bumps **≥ ~2u wavelength** — navigable mounds/washboard, not fine grain. Finer "texture" than that is a normal-map/material look only (Phase 4), not something the ball collides with. Doubling to 128×128 is a future knob if the coarse version reads too smooth; deferred.

**Downhill-roll interaction (watch item):** bumps create real local slopes, so a coasting ball will wander over rough ground (wanted). Keep roughness wavelength above the downhill probe step (eps = 0.75u) so it reads as terrain, not jitter. Tunable amplitude keeps it from turning coast into chaos.

**Test:** unit-test that `getTerrainHeight` is deterministic, that the mask keeps the spawn ring flat (roughness = base inside clear radius), and that `generateTerrainHeights()` equals `getTerrainHeight` at grid points (proves the unify didn't desync collider vs render vs sim).

---

### 🔴 Feature C — Voxel crumble / crashable scenery  ·  *dynamic sphere (fake) or new dynamic box (real)*  ·  **DESIGNED, DEFERRED (next session)**

**Goal (Grayson):** "take the columns and cubes and turn them into crumpled/voxel versions you can crash through and run over, and deal with the debris." Show off the physics.

**The wall.** True crumbling = many **dynamic** chunks that stack, topple, and rest as blocks. The bridge has **no dynamic box** and static boxes can't rotate — so authentic tumbling brick-stacks are a **C-bridge primitive + WASM rebuild** (host `emcc`). That's the "real" path, and it's the biggest lift in this phase.

**The in-sandbox fake (recommended first — Grayson's pick).** Keep each crumble block as a **solid static box until it's hit hard enough**, then on a deterministic impact threshold: destroy the static body and **burst it into ~8–12 dynamic-sphere debris** with seeded outward impulses. The debris then rolls around as knock-around rubble — *literally reusing Feature A's prop machinery.* No WASM. Reads ~80% as cool because the drama is in the burst + the aftermath you plow through.

**Debris shape (Grayson's steer): blocky/elongated, not balls.** Render debris as short **cuboid/elongated-box shards** riding sphere colliders (the columns-as-cylinders trick). In fast motion this reads as tumbling chunks; the sphere-under-box mismatch is only noticeable at rest, and debris mostly comes to rest scattered and small. Use high angular damping + stubby proportions so shards settle rather than roll forever. *(If the resting look bugs you, that's the trigger to spend the WASM budget on real dynamic boxes.)*

**Open design decisions for the build session:**
- **Trigger:** impact speed threshold vs. accumulated damage (a block takes 2–3 hits before it goes). Damage reads better but needs per-block hit state.
- **Render churn:** removing one block mid-round from a shared `instancedMesh` (scale-to-zero that instance, and keep the occlusion arrays in sync). Debris rendered on the same per-frame instanced path as props.
- **Determinism/replay:** trigger + debris directions must come from sim state + the seeded stream so a replay reproduces the same collapse. F9-safe by construction if we're disciplined.
- **Perf:** cap total live debris (pool + retire oldest) so a smash-happy run doesn't spawn hundreds of bodies.

**Verdict:** build the fake next session; escalate to real dynamic-box voxels (WASM) only if the fake's resting look isn't good enough. Both paths recorded so the decision is a playtest verdict, not a re-scoping.

---

### 📌 Phase P exit gate (per feature, when pulled)
Sim/unit tests green (scatter + roughness determinism) · full suite green · `tsc -b` + `vite build` clean · **Grayson playtest** (the feel verdict — clutter density, floor roughness amount, debris drama). Record in STATUS.md.

---

## 🔀 Working Model

| Thing | V1 | V2 |
|-------|----|----|
| Folder | `OneDrive\Projects - Personal\Game-Marble\` | `C:\Projects-local\Game-Marble\` (standalone clone, not a nested worktree) |
| Branch | `main` (tag `v1.0.0`) | `v2` |
| Launcher | `launch_game.bat` → :5173 | `launch_v2.bat` → :5174 |
| Rule | frozen — bugfixes only | all new work |

Both can run simultaneously for A/B feel checks. Merge `v2` → `main` only at parity + perf exit criteria.

---

## 📝 Handoff Notes (2026-07-02)

**Folder structure changed.** V2 used to live as a git worktree nested inside the OneDrive folder (`Game-Marble/v2/`). That caused two problems: OneDrive tried to sync `node_modules`/build output on every file change, and the worktree's `.git` link stored Windows-absolute paths that made it fragile to touch from any non-native-Windows tooling. We retired the worktree and moved v2 to a plain standalone clone at `C:\Projects-local\Game-Marble`, tracking `origin/v2` same as before. V1 stays untouched in OneDrive on `main`.

**If you're picking this up fresh:**
- Do your v2 work in `C:\Projects-local\Game-Marble`, not OneDrive. OneDrive `Game-Marble/` is v1 only now — frozen, bugfixes only.
- There is no worktree link between the two folders anymore. They're independent clones of the same GitHub repo (`graysonchalmers/Marble`), connected only by shared branches on `origin`. Push/pull normally to sync.
- Phase 0 scaffold work (folder skeleton, vitest harness, `engine/loop.ts` driver) has **not** started yet — everything below the checked box in Phase 0 is still open.
- No functional/gameplay work has landed on `v2` yet beyond the docs (PRD/ARCHITECTURE/PLAN) and the dedicated launcher. The actual strangler-fig extraction (Phase 1) hasn't begun.
