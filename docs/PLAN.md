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
- Multiple enemies with pack search behavior — design the AI legibility overlay (Debug / Dev-Tools Backlog) first; it is the instrument for tuning these hunt patterns
- Arena variation seeds

## Phase 4 — Art Direction Pass 🎨
Deferred deliberately (your art background = this phase deserves real attention, not scraps):
- Stylized shading pass, palette system, post stack
- Sonar visualization (optional ripple VFX synced to audio pings)

### 🎞️ Post-processing / screen-FX stack  ·  ⬜ **BACKLOG (design-only)**

**Goal (Grayson):** a cinematic polish pass — depth of field, bloom, lens distortion / chromatic aberration, better anti-aliasing, vignette, and "other stuff" (motion blur, film grain, tone-map / colour grade).

**Approach.** One toggleable `EffectComposer` stack (`@react-three/postprocessing`), wired into the Quality presets (Phase 2). Sensible order: render → **AA** (SMAA/TAA) → SSAO (opt) → **DoF** (bokeh) → **bloom** → **chromatic aberration + lens distortion** → vignette → tone-map → film grain. Master `postFX` toggle + a per-effect sub-toggle & intensity slider (your art eye drives the values).

**Perf / mobile.** Post is fill-rate heavy → gate behind Quality preset; default most effects **off** on iPad/mobile (see [[game_marble_box3d_mobile_feasibility]]). AA + bloom + vignette alone ≈ 80% of the look for ~20% of the cost — land those first.

**Determinism/feel.** Render-only, zero sim touch → **F9-safe by construction**, never touches replay bytes.

**Scope note.** This is where the art background pays off — treat as its own art cycle, not scraps. **Est: 1–2 sessions, incremental.**

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

### 🔴 Feature C — Voxel crumble / crashable scenery  ·  *dynamic sphere (fake) → dynamic box (real)*  ·  ✅ **BUILT (session 20): fake burst path AND real dynamic-box debris (in-cloud WASM rebuild)**

**Goal (Grayson):** "take the columns and cubes and turn them into crumpled/voxel versions you can crash through and run over, and deal with the debris." Show off the physics.

**The wall.** True crumbling = many **dynamic** chunks that stack, topple, and rest as blocks. The bridge has **no dynamic box** and static boxes can't rotate — so authentic tumbling brick-stacks are a **C-bridge primitive + WASM rebuild** (host `emcc`). That's the "real" path, and it's the biggest lift in this phase.

**The in-sandbox fake (recommended first — Grayson's pick).** Keep each crumble block as a **solid static box until it's hit hard enough**, then on a deterministic impact threshold: destroy the static body and **burst it into ~8–12 dynamic-sphere debris** with seeded outward impulses. The debris then rolls around as knock-around rubble — *literally reusing Feature A's prop machinery.* No WASM. Reads ~80% as cool because the drama is in the burst + the aftermath you plow through.

**Debris shape (Grayson's steer): blocky/elongated, not balls.** Render debris as short **cuboid/elongated-box shards** riding sphere colliders (the columns-as-cylinders trick). In fast motion this reads as tumbling chunks; the sphere-under-box mismatch is only noticeable at rest, and debris mostly comes to rest scattered and small. Use high angular damping + stubby proportions so shards settle rather than roll forever. *(If the resting look bugs you, that's the trigger to spend the WASM budget on real dynamic boxes.)*

**Open design decisions — RESOLVED in the session-20 build:**
- **Trigger → impact-speed threshold** (not accumulated damage). A live block breaks when the player OR un-frozen enemy is in sphere-vs-AABB contact while moving faster than `CRUMBLE.smashSpeed` (9 u/s). Simplest F9-safe path (no per-block hit state); "crash through when fast" reads well. Accumulated-damage (2–3 hits) named as a future upgrade if playtest wants blocks to feel tougher.
- **Render churn → separate instancedMesh, NOT mixed into the cubes.** Crumble is its own `instancedMesh` (unit box, per-frame matrix = position+tilt+scale, zero-scaled when `!crumbleAlive[i]`); debris is a fixed `maxLiveDebris`-size pool mesh (live slots filled from snapshots, rest zero-scaled). **This decoupled it entirely from the cube occlusion arrays** — no sync risk, so crumble blocks simply aren't occluded in v1 (scope cut, named; revisit if pillars-style occlusion is wanted).
- **Determinism/replay → F9-safe by construction.** Smash trigger reads sim-owned position/velocity; every debris value (radius, direction, speed, spin, shard dims, spawn offset) is drawn from the seeded RNG stream; crumble scatter is drawn LAST so `crumbleCount:0` runs are byte-identical. `crumbleCount` rides the replay header so replays rebuild the same blocks. Proven by a real-WASM determinism test (same seed → bit-identical debris trajectories).
- **Perf → lazy create + pool cap.** Debris created on smash (not pre-spawned — dormant blocks cost nothing), capped at `CRUMBLE.maxLiveDebris` (60) with retire-oldest, culled on fall-off, all cleared on round reset. New `Box3DWorld.destroyBody(ptr)` retires a single body without a full world teardown.

**Shape (as designed):** debris = elongated cuboid shards (seeded dims) riding sphere colliders, high angular damping so they settle stubbily — the columns-as-cylinders trick. Blocks park out of the world on smash and **reform on `resetPositions`** (each round starts intact).

**Verdict (session 20):** BOTH paths shipped + verified (vitest 123/123 ×3, tsc + build clean). The fake burst path landed first; then — after proving the Box3D WASM bridge rebuilds in-cloud behavior-equivalently (see [[game-marble-wasm-cloud-build]]) — the **real dynamic-box primitive** (`marble_box3d_create_dynamic_box`) was added and debris switched to real boxes whose collider matches the shard. What was "the biggest lift in this phase, gated on a host rebuild" became a same-session in-cloud add. **Remaining escalation (optional, playtest-driven):** stacking/toppling brick-stacks (a crumble block made of many small dynamic boxes that topple as a pile) — the primitive now exists, so it's a sim/render change, no new WASM. Also unblocked by the same capability: rotated static box (→ tilted obstacle colliders match the visual) + cylinder (→ round column colliders).

---

### 🟣 Feature D — Destructible columns → brick debris  ·  *static box → dynamic box*  ·  ✅ **BUILT (session 25)** — columns smash into height-scaled lavender brick debris; reuses the crumble machinery, no new WASM. `columnsCrumble` store key (default **on**, Grayson's "all columns") + Settings → Environment toggle. Occlusion made alive-aware so a smashed pillar vanishes + stops occluding. Gate: tsc clean · vitest 130/130 ×2 (+2 sim, +5 real-WASM) · build 2.524 MB.

**Goal (Grayson):** "make all of the columns destructible as well, and they just turn into our sort of brick shapes." Completes the original Feature C vision ("take the columns AND cubes and turn them into crumpled/voxel versions you can crash through") — session 20 shipped the crashable *crate* (crumble block); this makes the **tall pillars** crashable too, so weaving through a column field and smashing a pillar into a shower of bricks becomes part of play.

**Why it's cheap now.** Everything Feature C needs already exists: the smash detector (`detectSmashes`: fast hitter in sphere-vs-AABB contact over `CRUMBLE.smashSpeed`), the burst (`smashBlock` → seeded dynamic-box brick debris), the debris pool (`maxLiveDebris`, retire-oldest), reform-on-reset, F9 determinism, and the varied-brick-shape debris (session 22). Columns are already static boxes in physics (square-footprint collider) with cylinder *visuals* + camera occlusion (session 16). So Feature D is mostly **pointing the crumble machinery at the column bodies** — no new WASM, no new primitive.

**Design sketch.**
- A `columnsCrumble` toggle (store key, Environment + Dev Tools) OR just make columns always destructible (decide at build — default likely "all destructible" per Grayson's "all of the columns"). Simplest: reuse the existing column bodies as crumble targets; no separate spawn.
- Track column bodies in the smash detector the same way crumble blocks are (`columnAlive[]`, park on smash at `CRUMBLE.parkY`, hide the cylinder instance via zero-scale like `crumbleAlive`).
- On smash, burst into **more** debris than a crate (a 12u pillar has more mass/volume than a 4u crate) — scale `debrisPerBlock` by column volume, e.g. `round(debrisPerBlock * columnHeight / CRUMBLE.scale)` capped, so a tall pillar throws a taller column of bricks. Spawn offsets distributed along the pillar's height (not just a cube volume) so it collapses top-to-bottom-ish.
- Debris = the same varied brick shards (session 22 shape variety already covers "vary the brick shapes"). Tint the column debris lavender (`#b8b0c8`, the column colour) vs the rust crate debris so the rubble reads as "from that pillar."
- Determinism: column-smash trigger reads sim state; all debris values seeded; column-destructibility state rides the replay header (like `crumbleCount`). Keep `columnCount:0` / all-intact runs byte-identical by drawing any new RNG **after** the existing streams.

**Scope / risks.** (a) Debris budget — tall columns × many bricks can blow past `maxLiveDebris` fast; the retire-oldest guard handles it but a big column field smashed at once may pop bricks out early (tune the per-column debris scale + cap). (b) Occlusion — a parked (smashed) column should stop being an occluder; decouple like crumble (its own state, not mixed into the occlusion arrays). (c) The cylinder visual bursting into boxes is a visual≠collider seam (house style — the collider was already a square box). **Est: ~1 session** (sim: column smash tracking + height-distributed burst; render: hide-on-smash + column-debris tint; a determinism + smash test; playtest).

---

### 🟠 Feature E — Ramp / pyramid cubes (launch off the unbreakable squares)  ·  *stepped static box*  ·  ✅ **BUILT (2026-07-14)** — stepped no-WASM path (Grayson's pick over the WASM smooth-wedge). `rampCubeRatio` store key (default **0.5**) converts a seeded subset of cubes into cardinal-facing stepped-box wedges you drive up + launch off; ramp pass drawn LAST from the seeded stream (0 ratio = byte-identical, F9). Cube instance hidden + wedge drawn by `<RampObstacles>`; rides the replay header. Dev Tools → Clutter slider. Gate: tsc clean · vitest 134/134 ×3 · build 1.31 MB. **Upgrade path (backlog):** true smooth ramp = the rotated-static-box WASM primitive (Option 1 below). **⚠️ Playtest 2026-07-14 (Grayson): (a) BUG — a cube renders on top of each ramp (CubeOcclusion restore() overrides the cube-hide; fix = pass `alive=!rampFlags[i]`). (b) SPEC CHANGE — replace cubes ENTIRELY with pyramids (no cube+ramp coexistence, likely ALL cubes, maybe literal 4-sided pyramids not one-way wedges). See Known Issues.**

**Goal (Grayson):** "half of the unbreakable squares → pyramids, so you can drive up and ramp off them." Turn some of the immovable cubes into ramps/wedges the marble climbs and launches off — the marble has no jump, so a ramp *is* the air/hop mechanic. A free source of verticality + trick lines through the arena.

**The collider problem (Phase P budget).** A ramp face is a *sloped* surface. The three bridge colliders — static box (axis-aligned, no rotation), dynamic sphere, heightfield — can't express a clean wedge out of the box. Three ways to get the slope, cheapest→highest-fidelity:

| Option | How | New WASM? | Feel | Cost |
|---|---|---|---|---|
| **1. Rotated static box (tilted slab)** ⭐ | One thin static box tilted to the ramp angle = a real ramp face. The rotated-static-box primitive is **already unblocked** (proven in-cloud, see [[game_marble_box3d_collider_primitives]] / [[game_marble_wasm_cloud_build]]). | rebuild only (in-cloud, proven) | true smooth ramp → clean launch | ~1 session |
| **2. Heightfield mound** | Sculpt a local pyramid bump into the terrain heightfield (ties into Feature B). | none | coarse (64×64 @ 2u → rounded, not crisp); it is *floor*, not a placed obstacle — can only live where terrain is authored | cheap |
| **3. Stepped box ziggurat** | Stack a few shrinking axis-aligned static boxes into stairs. | none | choppy stair-launch, not a smooth ramp | medium |

**Recommend Option 1** — the primitive that blocked tilted colliders is gone, so a real wedge is now a sim/render + rebuild job, and it gives the launch feel Grayson is describing. Option 2 is the zero-risk fallback if we do not want to spend the rebuild.

**Design sketch (Option 1).**
- New store key `rampCubeRatio` (default **0.5** — Grayson's "half"): of the unbreakable cubes, a seeded subset becomes ramps; the rest stay square. Ratio + seed ride the replay header so replays rebuild the same ramp layout.
- Visual = a wedge/pyramid mesh over the tilted-slab collider (visual≠collider is house style). Orientation seeded so ramps face varied directions (or face-toward-arena-center for readable launch lines — decide at build).
- Launch feel is emergent: ball speed × ramp angle → air. Tune ramp angle (store key) so a normal coast gives a *small* hop and a fast line gives real air. No new jump code.
- Determinism: ramp selection + orientation drawn from seeded RNG **after** existing streams so `rampCubeRatio:0` runs stay byte-identical.

**Scope cuts (named):** unbreakable only (ramps do not crumble — they are the stable scenery vs Feature C/D smashables); no landing-trick scoring in v1 (just the launch physics); ramp count folds into existing cube count (we convert, not add, so body budget is unchanged).

**Risk:** the raycast fact — a ramp/wedge is a new occluder shape for enemy LOS; small/modest sizes keep "ramp as soft cover" reading as emergent. **Est: ~1 session (Option 1).**

---

### 🧪 Physics pass — "more physics things" (idea pool)  ·  ⬜ **BACKLOG**

A running grab-bag of physics-showcase ideas to pull opportunistically, now that the bridge has **box + sphere + heightfield + dynamic-box** (+ rotated static box once Feature E lands). Cheap render/sim ones first; bridge-change ones flagged **WASM-gated**.

- **Moving / kinematic hazards** — sliding walls, sweeping bars, rotating platforms _(needs kinematic-body support — check bridge; likely WASM-gated)_.
- **Toppling stacks** — Jenga-ish brick towers from dynamic boxes _(primitive already exists; deferred from Feature C/D — sim/render only)_.
- **Bumpers / boost pads** — high-restitution zones or impulse pads that fling the marble _(mostly sim; a pad = trigger volume + impulse)_.
- **Explosive barrels** — a crumble block that bursts with an outward **radial impulse** on nearby bodies _(reuses smash machinery + a neighbour query)_.
- **Chain reactions** — knock one prop into a cluster _(already partly emergent via Feature A props; tune counts/placement)_.
- **Wind / force volumes** — a directional force field that pushes light bodies (props, debris) but barely moves the player _(sim-side force accumulation)_.
- **Ice / mud zones** — per-region floor friction. ⚠️ **BLOCKED:** heightfield is a single friction value → needs per-material zones = **bridge change**.
- **Debris joints / ragdoll-ish links** — constraints between chunks _(needs a joint primitive = bigger **WASM-gated** lift)_.

**Rule:** each becomes its own card when pulled (goal → collider mapping → determinism note → est), same as Features A–E. **Est: pick-and-mix, ~½–1 session each.**

---

### 📌 Phase P exit gate (per feature, when pulled)
Sim/unit tests green (scatter + roughness determinism) · full suite green · `tsc -b` + `vite build` clean · **Grayson playtest** (the feel verdict — clutter density, floor roughness amount, debris drama). Record in STATUS.md.

---

## 🔎 Debug / Dev-Tools Backlog

Read-only visualization + tuning aids. None change gameplay or the sim, so all are **F9-safe by construction** (they read sim-owned state and draw only) and gate cheaply. Dev-only toggles (default off).

### 🛰️ AI legibility overlay — enemy vision & hunt patterns  ·  ✅ **BUILT (2026-07-14)** — `debugAI` dev toggle (Dev Tools → Debug Visuals). Draws vision-range ring, LOS ray (green sees / red blocked — real filtered raycast), hunt-state, last-known marker, movement target, + the 4 search waypoints & path (the visible hunt pattern). Reads render-only `MarbleSim.enemyDebug`; zero sim/RNG impact (F9-safe). Gate: tsc clean · vitest 134/134 · build clean. Richer than first designed: the sim already does a real vision raycast + 4-waypoint spiral search, so all layers are live data, not stubs.

**Goal (Grayson):** "debug visuals for how far the enemy can see, different hunting patterns, that sort of thing — design a system, leave it in the backlog for now." Make the enemy's "mind" visible so we can *tune* the AI now and *design* new search behaviors later against something we can see instead of guess at.

**Why it is cheap.** `EnemyAI.ts` is already pure functions — the state we would draw (vision result, hunt state, targets, avoidance probes) is already computed each tick; the overlay just surfaces it. No AI rewrite; mostly a render layer + a few state getters exposed on the sim snapshot.

**What it draws (layers, each independently toggleable):**
- **Vision range** — a ground ring (or cone, if/when vision becomes directional) at the enemy sight radius. Instantly shows "how far can it see."
- **Line-of-sight ray** — the existing `worldRaycast` enemy→player check, drawn as a line: **green = clear (it sees you)**, **red = blocked** (a prop/column/ramp is soft cover). The single most useful layer — it makes the "props are cover" mechanic legible.
- **Hunt state** — color the enemy or float a tag: **chase** (has LOS / locked) vs **search** (lost you, heading to last-known) vs **patrol/wander** (no target). Reads the existing state machine.
- **Last-known-player marker** — a ghost pip where the enemy last had LOS; the point it is searching toward. Shows *why* it moves where it does after you break line of sight.
- **Avoidance probes** — the short obstacle-avoidance rays already cast, drawn as stubs, so "why did it swerve" is visible.
- **Heading / velocity arrow** — where it is actually going this tick.

**Why build it before the pack-AI backlog.** Phase 3 lists "multiple enemies with pack search behavior." You cannot design pack/flanking search by feel alone — this overlay is the instrument that makes those "different hunting patterns" designable. Build the lens first; it de-risks that whole feature.

**Design (implementation shape).**
- Store key `debugAI` (default off, Dev Tools menu), optionally per-layer sub-toggles.
- A dedicated overlay group (three.js `LineSegments` / rings / sprites) reading a `enemyDebug` block added to the sim snapshot (visionRadius, losHit:boolean, state, lastKnownPos, avoidRays[], heading). Sim exposes it; render draws it. No new sim *logic*, just exposure.
- Zero determinism impact: draws from existing state, allocates no RNG, adds no bodies → F9 holds, replays unaffected.

**Scope (v1, when pulled):** visualize the *current* single-enemy AI only; no behavior changes, no in-overlay editing of AI params (that is a later "AI tuning panel"). Multi-enemy color-coding lands with the multi-enemy feature. **Est: ~½–1 session when pulled.**

---

## 🐞 Known Issues — 2026-07-14 playtest (Grayson) → 2026-07-15 (session 32) dispositions

Three items surfaced playtesting the Feature E / overlay build. **s32 status inline below.**

### 1. 🎞️ Replay desync — replay shows events that didn't happen  ·  ⚠️ **NOT REPRODUCIBLE at the sim level (s32)** — reframed
**Symptom (Grayson):** "the replay doesn't seem to be fully lined up… it shows in the replay that I hit the side but I don't think I did. Wondering if some of it is offset."
**s32 finding (headless, real WASM):** built `ReplayDeterminismObstacles.test.ts` — record→replay a 400-step scripted run through the FULL live clutter (heightfield terrain, 30 cubes, columns, 24 props, 12 crumble blocks, **rampCubeRatio:1 pyramids**) with the enemy AI running a real chase→**tag→catch**, rebuilt from the header alone. Result: **BIT-IDENTICAL at every step** (asserted per-step, not just the endpoint). So the core sim record→replay is **provably deterministic** — the "determinism leak" theory is *disproven* for the sim path. The old wedge had a **vertical launch wall** on its high side (a real "hit the side" surface); the pyramid conversion (s32) **removes all vertical walls** (4 sloped faces), which likely resolves much of the "hit the side" perception on its own.
**Remaining suspects (render / settings, NOT sim):** (a) the free-orbit + slow-mo replay camera revealing grazes/overlaps the live chase-cam hid; (b) settings drift — `terrainRoughness`/`physicsPreset` changed between recording and watching (header carries roughness, but a mid-session change to the store terrain global could desync); (c) the stepped-collider vs smooth-pyramid visual gap (small: 6 steps over 1.4u). **Next step: re-playtest the pyramid build first.** If "hit the side" persists, instrument render-side (log sim vs rendered ball position per frame) rather than hunting a sim leak the headless guard says isn't there.

### 2. 🎯 Tag pipeline — phantom tags in replay; real near-misses don't register  ·  🟡 **in-game half OPEN**, replay half explained (s32)
**Symptom (Grayson):** "in the replay… it looks like I get tagged several times. In game it kind of feels like I get tagged a couple times but it doesn't actually register."
**s32 read:** the *replay* "several tags" is NOT divergence (see #1 — replay is bit-identical). It's the recorded **post-tag settle** (s30 `tagSettleFrames`=16): the enemy homes in and visibly overlaps/bounces the player for the settle beat before the freeze — under the slow-mo free-orbit replay cam that reads as multiple tags. Expected behavior, not a bug. The *in-game* "feels tagged but doesn't register" is the **real, separate** issue: the tag fires only when centers are within `RULES.tagSlack` (0.1u) + radii, so a glancing overlap slips through.
**Investigate (in-game feel only):** a slightly more forgiving tag radius, or a swept/overlap test instead of pure center-distance, in the sim's tag check. Low-risk, F9-safe if the threshold rides tuning.

### 3. 🟠 Cubes → pyramids (was: ramp renders a cube on top)  ·  ✅ **SHIPPED (session 32)**
**Symptom (Grayson):** "all the ramps had a cube on top of them… all cubes replaced by pyramids." + "basically all the cubes should be pyramids… four-sided pyramids, not a wedge."
**Delivered (s32):** the one-way stepped wedge is replaced by a **4-sided stepped pyramid** (`MarbleSim.buildPyramidBoxes` — concentric shrinking axis-aligned static boxes, no WASM; symmetric, so the ball rolls up + launches off ANY side). Visual = a literal smooth square pyramid (`RampObstacles`). **Ratio → 1.0 by default** (every solid cube becomes a pyramid; `SCHEMA_VERSION` 10→11 drops the persisted 0.5 so old saves adopt it). **Cube-on-top fixed:** `CubeOcclusion` now takes an `alive` prop (`!rampFlags[i]`) so a converted cube stays hidden. Facing draw kept for RNG-stream parity (unused by the symmetric pyramid). Crumble blocks + columns untouched. Verified: tsc clean, vitest **135/135 ×3**, build 1.312 MB.
**Deferred lever:** if the stepped-collider-under-smooth-visual gap bugs the launch feel, upgrade to WASM tilted-slab faces (true smooth ramp) — noted, not built (kept this cycle no-WASM).

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
