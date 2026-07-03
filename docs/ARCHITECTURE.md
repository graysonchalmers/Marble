# 🏗️ ARCHITECTURE — Marble Game V2

Target architecture for the v2 rebuild. Principle: **React renders; systems simulate.**

---

## 1. 🧠 Mental Model

```
┌─────────────────────────────────────────────────┐
│  React / R3F  (declarative view layer)          │
│  components read refs, never own game state     │
└──────────────▲──────────────────────────────────┘
               │ refs / transient subscriptions
┌──────────────┴──────────────────────────────────┐
│  Game Loop  (single fixed-timestep driver)      │
│  ┌─────────┐ ┌────────┐ ┌───────┐ ┌──────────┐  │
│  │ Physics │ │ AI     │ │ Sonar │ │ GameRules│  │
│  │ system  │ │ system │ │ system│ │ system   │  │
│  └─────────┘ └────────┘ └───────┘ └──────────┘  │
│  systems are plain TS — no React imports        │
└──────────────▲──────────────────────────────────┘
               │ reads config, emits events
┌──────────────┴──────────────────────────────────┐
│  State: settings slices (persisted) +           │
│  session state (transient) + event bus          │
└─────────────────────────────────────────────────┘
```

Why: v1's biggest costs come from game logic living inside React's render/effect cycle. Pull simulation out; React becomes a visualizer.

## 2. 📁 Folder Structure

```
src/
  engine/            # plain TS, zero React imports
    loop.ts          # fixed-timestep accumulator, drives systems
    events.ts        # tiny typed event emitter (tagged, roundStart…)
  systems/
    ai/              # port of EnemyAI.ts state machine (pure funcs — already close!)
    sonar/           # SoundManager rework: graph built once, params updated
    rules/           # game state machine: setup→countdown→playing→over
  state/
    settings/        # zustand slices: physics, audio, graphics, controls
    session.ts       # transient: gameState, score — NOT persisted
    persistence.ts   # versioned schema, debounced writes, migration
  render/            # R3F components (view only)
    scene/           # canvas, lighting, sky, fog
    actors/          # PlayerMarble, EnemyMarble (subscribe to sim via refs)
    level/           # instanced cubes, ground
  ui/                # HTML overlay: menus, settings, debug
  input/             # keyboard/mouse abstraction (enables gamepad later)
```

## 3. 🎛️ State Rules

| Kind | Where | Persisted | Update rate |
|------|-------|-----------|-------------|
| Tuning settings | zustand slices | ✅ debounced (300ms), versioned key | on user input |
| Session (gameState, score) | zustand session slice | ❌ | on events |
| Per-frame data (positions, distance, closing speed) | plain refs / system fields | ❌ | every tick — **never through zustand** |
| Debug readouts | transient zustand subscribe or 5Hz mirror | ❌ | throttled |

Bans carried in from v1 lessons: no `setState` in `useFrame`; no localStorage in any hot path; no `window.location.reload()`; no React `key` remounts as a tuning mechanism (mutate body properties or rebuild the body inside the physics system instead).

## 4. ⏱️ Fixed Timestep

- Accumulator loop: simulate at fixed `simRate` (default 60Hz; physics substeps as needed), render interpolates
- All systems tick in a defined order: input → AI → physics → rules → sonar
- Determinism-friendly: same seed + same inputs ≈ same run (enables replay-based feel testing)

## 5. 🔊 Sonar System v2

Keep v1's tuned behavior (drone/pulse, closing/opening channels, pitch modulation) but:

- Build the audio graph **once**; per-tick updates only set `AudioParam` targets (no node churn)
- Sonar reads sim state directly (distance, closing speed) — not React props
- Config comes from the audio settings slice; changes apply live without graph rebuild
- Keep all v1 tuning values as the default preset (they're earned data)

## 6. ⚡ Performance Program

| Lever | Approach |
|-------|----------|
| Draw calls | `InstancedMesh` for cubes; grid material shared; target < 50 calls |
| Allocations | Pre-allocated Vector3 scratch pool in systems; zero `new` in tick |
| Renderer | WebGPU with WebGL fallback (v1 has no fallback — add one) |
| Quality presets | Low/Med/High/Ultra: shadows, DPR, post, particle counts in one switch |
| Instrumentation | Real frame budget HUD: sim ms / render ms / GC, using `performance.now()` brackets + `renderer.info` |
| Physics | Keep cannon-es initially (parity first). Evaluate Rapier (WASM) in Phase 2 — ~5-10x faster, but re-tuning risk. Decision gate, not a default. |
| Ground Checks | O(1) mathematical height calculation from heightfield formula instead of CPU raycasting against 4000-triangle mesh. |
| Visual Coupling | Direct position and quaternion copy from physics to visual meshes to eliminate visual lag and resolve mushy controls. |
| Zustand Throttling | Transient player/enemy state updates throttled to 30Hz inside subscriptions to eliminate React render churn. |

## 7. 🧪 Testing

- Systems are pure TS → unit test AI transitions, sonar param math, rules machine (vitest)
- "Feel harness": headless sim runs (N seconds of scripted input) asserting invariants — enemy catches stationary player in < X s, search never idles, etc.
