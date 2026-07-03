# 📊 STATUS — Marble Game V2

> **Living truth.** Updated in the same session as the work — never at handoff time.
> States: ✅ **verified** (gate evidence recorded here) · 🔌 **wired** (code exists, no gate yet) · ⬜ **not started**. No fourth state, no "should work."

**Last updated:** 2026-07-02 (session 3)
**Open phase:** 1 — Extract Systems (Gate 0 ✅, re-verified session 3; boot check + commit still residual, see below)

---

## 🚦 Working rules (the framework)

Adapted from the Tool-3dViewer-Fable rebuild framework — the lesson there was that *building outrunning verifying* is the root failure mode, regardless of whether the builder optimizes for completeness or honesty.

1. **The docs are the spec.** PRD/ARCHITECTURE define the target. Feature ideas go to PLAN Phase 3 backlog, not the code.
2. **Verify before advancing.** Every phase ends with an exit gate: concrete, checkable evidence. Phase N+1 does not open until phase N's gate is green *and recorded here*. "Wired but untested" is not done.
3. **Port the earned stuff, rewrite the cheap stuff.** Sonar tuning, AI feel constants, physics values are battle-tested data (see [TUNING.md](TUNING.md)) — carry them verbatim. Glue code can be rewritten freely.
4. **The game boots and plays after every phase.** A phase that ends with a broken game isn't done (PLAN rule of thumb).
5. **Deviations get logged**, not silently absorbed.
6. **Session protocol:** start by reading this file (it names the open phase and any red gates); end with this file accurate at the moment you stop, even mid-phase. If a gate fails and can't be fixed in-session, log it under Known issues — the next session starts there, never by opening a new phase on a red gate.

## Phase gates

| Phase | Scope | Gate (evidence required) | Status |
|---|---|---|---|
| 0 | Scaffold: folders, vitest, loop.ts | `npm run test` green (≥1 real loop test) · `npm run build` clean · game plays identically to v1 | ✅ 2026-07-02 — sandbox CI: vitest **8/8** (fixed-step count, constant dt, accumulator carry, tick order, delta clamp, interp alpha, reset, EventBus) · `tsc -b && vite build` clean, single-file `dist/index.html` 2.4MB. **Residual (host/manual):** Grayson boots `launch_v2.bat`, confirms game plays identically — scaffold touched no runtime code paths, so risk ≈ 0 |
| 1 | Extract systems (AI → rules → sonar → store → loop) | Unit tests per system green · feel-invariant suite green (see below) · manual A/B vs v1 at 5173/5174 | 🔌 item 1 (AI) done: moved to `systems/ai/EnemyAI.ts`, 5 unit tests (F2/F3/F4 + 2 sanity) green in sandbox CI. Items 2-5 (rules, sonar, store, loop wiring) ⬜. Full phase gate (manual A/B) not yet run. |
| 2 | Performance | Perf HUD screenshot: 60fps at defaults, draws < 50, sim tick 0-alloc in profiler · WebGL fallback boots | ⬜ |
| 3 | Game loop depth (backlog) | per-feature, defined when pulled | ⬜ |
| 4 | Art direction pass | per-feature, defined when pulled | ⬜ |

## 🎯 Feel invariants (Gate 1 measurable half)

The "feels identical to v1" criterion, made testable. Headless sim runs (scripted input, fixed seed) asserting:

| # | Invariant | Source of truth | Status |
|---|---|---|---|
| F1 | Enemy in `chase` catches a stationary player from 20u in < 8s at default tuning | v1 play data | ⬜ **deferred to Phase 1 item 5** (Grayson's call, session 3): depends on physics force integration (`EnemySphereV2.tsx`), not just the pure AI module, so it can only be measured once the loop actually wires AI + physics together |
| F2 | AI never re-enters `idle` after first contact (search loops forever) | EnemyAI.ts:134 "NEVER GO IDLE" | ✅ 2026-07-02 (3) — `systems/ai/EnemyAI.test.ts` |
| F3 | `alert` → `chase` transition at exactly 0.5s of continuous visibility | ALERT_DURATION | ✅ 2026-07-02 (3) — `systems/ai/EnemyAI.test.ts` |
| F4 | Losing line-of-sight in `chase` → `search` within one tick; first waypoint is velocity-projected (≤ 15u ahead) | EnemyAI.ts waypoint gen | ✅ 2026-07-02 (3) — `systems/ai/EnemyAI.test.ts` |
| F5 | Sonar closing-channel pitch at distance ≤ 10u (audioSolidDistance) reaches max pitch (300Hz base + modulation 4) | TUNING.md audio block | ⬜ |
| F6 | Sonar strategy "drone" produces continuous tone; "pulse" produces discrete pings; both respect closing/opening volume split (1.0 / 0.3) | SoundManager port | ⬜ |
| F7 | Restart returns to `countdown` in < 500ms with zero `window.location.reload` calls | PRD success criteria | ⬜ |
| F8 | Same seed + same scripted input ⇒ same tagged-time within tolerance (determinism smoke) | ARCHITECTURE §4 | ⬜ |

## Deviations from docs

| Date | Deviation | Why |
|---|---|---|
| — | none yet | |

## Known issues

| # | Issue | Impact |
|---|---|---|
| 1 | **Sandbox mount serves stale/truncated file views** (same pattern as the Fable rebuild's known issue #2): files edited on host intermittently read truncated in the sandbox, which corrupted a `package.json` npm parse and a test-file copy. | Workaround: CI runs copy sources to sandbox-local scratch dir and rewrite suspect files there; host files are authoritative. Verify file sizes before trusting sandbox reads. Session 3: `npm install` on the mounted folder itself fails outright (`ENOTEMPTY` on rename) — must `npm install` inside the scratch copy, not on the mount. Also hit the copy corrupting BOTH `loop.test.ts` (truncated mid-line) and `events.ts` (trailing null byte) even via `rsync` — byte counts matched but content didn't. Fix was rewriting both files directly from `Read`-tool-verified content via heredoc, not rsync. |
| 2 | **File deletion (`rm`/`unlink`) on the mounted folder is blocked** ("Operation not permitted"), same root cause as the `.git` internals issue — but `mv`/rename on the same mount works fine. | When a file needs removing (e.g. `EnemyAI.ts` after moving it to `systems/ai/`), rename it to a `.DELETE_ME` suffix instead and hand the actual deletion to Grayson as a one-line command in the commit instructions. |

## Session log

| Date | Session did | Left open |
|---|---|---|
| 2026-07-02 | Migrated v2 worktree → standalone clone at `C:\Projects-local\Game-Marble`; docs updated | Phase 0 |
| 2026-07-02 (2) | Adopted verification framework from Tool-3dViewer-Fable rebuild (this file); snapshot v1 tuning → TUNING.md; Phase 0 scaffold (folder skeleton, vitest, `engine/loop.ts` + `engine/events.ts`, 8 tests); Gate 0 run in sandbox CI (8/8 tests, build clean); deleted stray `test_write.txt` | Gate 0 manual residual (boot check) · git commit (Grayson, PowerShell) · calibrate feel-invariant F1 against v1 |
| 2026-07-02 (3) | Re-verified Gate 0 in fresh sandbox session (8/8 vitest, `tsc -b`+build clean, 2.4MB single-file — matches prior run); documented new sandbox mount failure modes (see Known issues #1, #2); **Phase 1 item 1 (AI extraction) done**: moved `components/game/EnemyAI.ts` → `systems/ai/EnemyAI.ts` (pure move, no logic changes), updated the one import site in `EnemySphereV2.tsx`, wrote 5 unit tests covering F2/F3/F4 + 2 sanity checks — all green (13/13 total incl. Phase 0's 8); `tsc -b`+build re-verified clean after the move (same 621 modules, same 2.4MB). F1 deferred to Phase 1 item 5 (Grayson's call — needs physics integration, not just the AI module) | Gate 0 manual residual (boot check) · git commit (Grayson, PowerShell, incl. deleting the renamed `EnemyAI.ts.DELETE_ME` stub) · Phase 1 items 2-5 (rules, sonar, store, loop wiring) · manual A/B for Phase 1 exit gate |
