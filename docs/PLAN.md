# 🗺️ PLAN — V2 Build Plan

**Strategy: Strangler-fig refactor, not rewrite.**
V2 starts from v1's code (this branch already contains it). We extract systems one at a time while the game stays playable at every commit. Rationale: the sonar + AI feel is tuned, earned data — a fresh rebuild re-derives it at high risk for zero player-facing gain.

Rule of thumb: **the game must boot and be playable after every phase.** If a phase ends with a broken game, the phase isn't done.

---

## Phase 0 — Scaffold (½ day) 🧹
- [x] v2 worktree + branch + launcher (done)
- [ ] Create folder skeleton from `ARCHITECTURE.md` (empty modules OK)
- [ ] Add vitest + one trivial test to prove the harness
- [ ] Add `engine/loop.ts` fixed-timestep driver (not yet wired)

**Exit:** game unchanged, plays identically to v1.

## Phase 1 — Extract Systems (2-4 sessions) 🔧
Order matters — least entangled first:

1. **AI** → `systems/ai/` — `EnemyAI.ts` is already pure functions; move + unit test state transitions
2. **Rules** → `systems/rules/` — game state machine out of Scene's useEffects; kill `window.location.reload()` restart
3. **Sonar** → `systems/sonar/` — persistent audio graph, param-only updates; keep v1 tuning as default preset
4. **Store split** → `state/` slices + debounced versioned persistence; migrate `MARBLE_GAME_SETTINGS_V2` key
5. **Wire the loop** — systems tick from `engine/loop.ts`; React components become views reading refs

**Exit:** parity checkpoint — A/B against v1 launcher side by side (5173 vs 5174). Feel identical.

## Phase 2 — Performance (2-3 sessions) ⚡
- [ ] Instanced level geometry; draw-call audit (target < 50)
- [ ] Zero-allocation tick (scratch vector pool); profile GC
- [ ] Quality presets (Low→Ultra) replacing loose graphics toggles
- [ ] Real perf HUD (sim ms / render ms / draws) replacing PerfBridge
- [ ] WebGL fallback for non-WebGPU browsers
- [ ] **Decision gate:** cannon-es vs Rapier benchmark at 10x body count — only switch if wins are big and feel survives

**Exit:** 60fps at defaults on mid-range GPU; budget HUD proves it.

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
| Folder | `Game-Marble/` | `Game-Marble/v2/` |
| Branch | `main` (tag `v1.0.0`) | `v2` |
| Launcher | `launch_game.bat` → :5173 | `v2/launch_v2.bat` → :5174 |
| Rule | frozen — bugfixes only | all new work |

Both can run simultaneously for A/B feel checks. Merge `v2` → `main` only at parity + perf exit criteria.
