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
