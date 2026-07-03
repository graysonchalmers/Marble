# 🎯 PRD — Marble Game V2 ("Sonar Tag")

**Status:** Draft v1 · July 2026
**Owner:** Grayson Chalmers
**Baseline:** v1.0.0 tag on `main` (preserved, playable)

---

## 1. 🧭 Vision

A minimalist 3D predator-prey game where **you hear the danger before you see it**. You're a marble being hunted by an AI sphere. A sonar audio system converts distance and closing speed into pitch and pulse — tension lives in your ears, not a UI bar. Think *hide-and-seek meets submarine warfare*, rendered as a clean stylized toybox.

**One-liner:** *Tag, but the "it" is a physics predator and your radar is sound.*

## 2. 🏛️ Design Pillars

| # | Pillar | Meaning in practice |
|---|--------|--------------------|
| 1 | **Audio is the HUD** | Sonar drone/pulse is the primary threat channel. Visual UI stays minimal. |
| 2 | **Physics is the game feel** | Momentum, mass, friction are gameplay — not decoration. Tuning sliders stay first-class. |
| 3 | **Readable AI** | Enemy states (idle/alert/chase/search) telegraphed via color + sound. Player can *learn* the hunter. |
| 4 | **Runs great everywhere** | 60fps target on mid-range hardware. Quality presets, not silent degradation. |

## 3. 🔁 Core Loop (kept from v1)

1. **Countdown** → player and enemy spawn in a cube-scattered arena
2. **Survive** — enemy hunts via state-machine AI with predictive interception
3. **Listen** — sonar pitch/rate encodes distance + closing speed
4. **Break line-of-sight** — force the enemy into search mode, exploit its waypoint sweep
5. **Tagged** → game over, survival time is the score → restart

## 4. ✅ What V1 Proved (keep)

- Sonar system works and is *the* hook — drone + pulse strategies, closing/opening channels
- Enemy AI feel: alert delay, predictive pursuit, velocity-projected search waypoints
- Physics tuning ranges (gravity −22.5, worldScale 0.75, etc.) — these are tuned values, treat as data
- WebGPU renderer path is viable

## 5. ❌ V1 Pain Points (fix)

| Problem | Evidence |
|---------|----------|
| Monolithic store | 80+ flat keys in one Zustand store; settings, session, and debug mixed |
| Per-frame React churn | `setState` from `useFrame`, localStorage read+write on every slider change |
| Restart = page reload | `window.location.reload()` in `restartGame()` |
| Component remounts as tuning | Enemy remounted via React `key` when size/mass changes |
| No fixed timestep ownership | Physics rate is a setting, but game logic ticks at render rate |
| Perf instrumentation is a hack | `PerfBridge` self-measures FPS; cpu/gpu hardcoded 0 |
| No tests, no CI | Feel regressions are only caught by playing |

## 6. 🚀 V2 Scope

### In scope
- **Architecture rebuild** per `ARCHITECTURE.md` — systems decoupled from React
- **Performance program** — fixed timestep, instancing, quality presets, perf budget (see PLAN Phase 2)
- Same game, same feel: tag + sonar loop reaches parity with v1 before any new features
- Proper restart (no reload), proper settings persistence (debounced, versioned)

### Out of scope (v2.x backlog, not v2.0)
- New game modes (role-swap tag, multiplayer, multiple enemies)
- Level editor / procedural arenas beyond current cube scatter
- Mobile touch controls
- Art direction pass (deliberately deferred — nail systems first, then style)

## 7. 📏 Success Criteria

- [ ] Feature parity with v1.0.0 (blind A/B: the game *feels* the same or better)
- [ ] 60 fps sustained at default settings on mid-range GPU; no GC hitches > 4ms from game code
- [ ] Restart without page reload, < 500ms
- [ ] Zero per-frame allocations in hot paths (verified via profiler)
- [ ] Settings survive refresh; store split into slices; no localStorage I/O in frame loop
- [ ] `npm run build` clean; deployable single-file build preserved
