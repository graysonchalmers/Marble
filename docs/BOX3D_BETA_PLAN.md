# Box3D Physics Beta Plan

Goal: build a parallel Box3D-powered physics path for Marble without changing the current Cannon game as the default runtime.

The current version remains the latest playable build. The Box3D path is a beta track that must be selectable, reversible, and gate-verified before it can replace anything.

## Current Baseline

Marble V2 currently uses:

- React + R3F for rendering and UI.
- `@react-three/cannon` for the live physics world.
- Plain TypeScript systems for AI, rules, sonar, loop, and state.
- Vite for dev/build.

Physics ownership today is still inside React components:

- `Scene.tsx`: owns the Cannon `<Physics>` world.
- `PlayerSphere.tsx`: player body, torque, jump impulse, grounding, camera follow.
- `EnemySphereV2.tsx`: enemy body, AI force application, raycasts, grounding, tag check.
- `Level.tsx`: terrain heightfield, static walls, falling cubes.

The Box3D beta should move rigid body ownership behind an adapter while keeping rendering, UI, audio, AI, rules, settings, and game-state logic in TypeScript.

## Shared Resources

Keep these shared between current V2 and Box3D beta unless a gate proves they need a fork:

| Resource | Shared? | Notes |
|---|---:|---|
| React/R3F rendering | Yes | Visual components should read body transforms from refs/adapter snapshots. |
| Three.js assets/materials | Yes | Player/enemy/terrain visuals can be reused. |
| AI state machine | Yes | Box3D only changes movement/query implementation. |
| Rules system | Yes | Countdown, score, gameover, restart stay backend-neutral. |
| Sonar system | Yes | Reads player/enemy positions; backend should publish the same refs. |
| Zustand settings/session store | Yes | Add backend selection only if needed. |
| Terrain generation math | Yes | Height data must be converted carefully for Box3D orientation/winding. |
| Debug/perf UI | Yes | Extend with backend and WASM stats later. |
| Cannon physics bodies/hooks | No | Current backend only. Box3D beta uses adapter-owned body ids. |
| Box3D C/WASM bridge | No | Beta-specific until stable. |

Package policy:

- Do not add a second JS physics package for this beta unless Box3D becomes blocked.
- Do not bind all of Box3D. Export a narrow C ABI for the game-specific operations.
- Keep generated WASM/JS artifacts in a predictable local folder and document the build command.

## Target Shape

```text
src/
  physics/
    types.ts
    box3d/
      README.md
      Box3DWorld.ts
      box3dBridge.ts
      native/
        README.md
        box3d_bridge.c
    cannon/
      README.md
```

The adapter boundary should expose game-level operations, not raw Box3D everywhere:

- `createWorld(settings)`
- `destroyWorld()`
- `step(dt)`
- `reset()`
- `createSphereBody(...)`
- `createBoxBody(...)`
- `createHeightfield(...)`
- `applyForce(...)`
- `applyTorque(...)`
- `applyImpulse(...)`
- `setLinearVelocity(...)`
- `getBodyTransform(...)`
- `readTransformsBatch(...)`
- `raycastClosest(...)`

## Launcher Policy

`Launch - Game Picker.bat` is the one-click entrypoint.

- Default: latest/current V2.
- Optional: Box3D beta via query string.
- Existing `launch_v2.bat` remains untouched for direct current-version launch.

The beta route can initially show a placeholder overlay. It becomes a real Box3D scene only after Phase B gates pass.

## Risks And Concerns

| Risk | Impact | Mitigation |
|---|---|---|
| Box3D is C17, not an npm dependency | Requires Emscripten bridge and Vite asset handling | Start with a very small bridge and a falling-sphere smoke test. |
| Browser threading requirements | Pthreads require cross-origin isolation headers | Start single-threaded; enable pthreads only after baseline works. |
| WASM call overhead | Per-body calls can erase physics gains | Batch transform reads/writes through typed arrays. |
| Different solver feel | Existing tuning values will not map 1:1 | Preserve settings names, retune behind beta preset, compare with feel gates. |
| Terrain orientation/winding mismatch | Spheres may collide above/below or slide incorrectly | Add a heightfield parity test before gameplay port. |
| Raycast/query behavior differences | AI vision and grounding can change | Wrap all queries behind adapter tests and debug visual checks. |
| Build complexity | One-click launcher can break if WASM artifacts are missing | Launcher must still run latest V2; beta should fail visibly but not block latest. |
| Generated artifacts churn | WASM output can clutter repo and reviews | Commit source/config first; decide later which generated artifacts belong in repo. |
| Current STATUS uncertainty | Some existing phase claims were downgraded previously | Keep Box3D beta gates separate and evidence-based. |

## Phases And Gates

### Phase A: Documentation And Scaffold

Scope:

- Add this plan.
- Add `src/physics` adapter folders and READMEs.
- Add one-click version selector launcher.
- Add app-level beta route placeholder using `?physics=box3d`.

Gate:

- `npm run build` passes.
- `npm run test` passes.
- Latest/current V2 still launches without query params.
- Box3D beta route is selectable and clearly marked as not yet simulated.

### Phase B: WASM Bridge Smoke Test

Scope:

- Add `box3d_bridge.c` with minimal exported functions.
- Add documented Emscripten build command.
- Load WASM from Vite.
- Create a Box3D world and simulate one sphere falling onto one static box.

Gate:

- Browser console reports Box3D bridge version/health.
- Falling sphere transform changes over fixed steps.
- No current V2 behavior changes.
- Build/test still pass.

### Phase C: Terrain And Player Prototype

Scope:

- Convert current terrain height data into Box3D heightfield format.
- Create player sphere body.
- Port player torque, top speed limiting, jump impulse, and reset behavior.
- Render player from Box3D transform snapshots.

Gate:

- Player rests on terrain, rolls, jumps, and resets.
- Heightfield collision visually matches terrain.
- No per-frame React state churn is introduced.
- Manual smoke: 2 minutes without physics instability.

### Phase D: Enemy, Queries, And Tag Loop

Scope:

- Create enemy sphere body.
- Port force movement.
- Replace AI line-of-sight raycast and grounding with adapter queries.
- Wire tag detection through distance/contact events.
- Feed sonar with Box3D positions.

Gate:

- Countdown -> playing -> enemy chase -> tag -> gameover works.
- AI state debug transitions match current V2 expectations.
- Sonar pitch/rate responds to distance and closing speed.
- F1 catch-time test exists for beta backend.

### Phase E: Parity And Performance Decision

Scope:

- Add backend comparison tests.
- Measure frame time, sim time, draw calls, and memory.
- Tune default beta values.
- Decide whether Box3D remains beta, becomes optional, or replaces Cannon.

Gate:

- Current V2 and Box3D beta can run from the launcher.
- Perf HUD evidence is recorded.
- Manual A/B notes are recorded.
- Replacement decision is written before any Cannon removal.

## Non-Goals For The First Pass

- Do not remove Cannon.
- Do not rewrite AI/rules/sonar.
- Do not make Box3D the default runtime.
- Do not bind the whole Box3D API.
- Do not add multiplayer, art direction changes, or gameplay changes as part of the physics beta.

## Future Backlog / Wish List

- **Gameplay Recorder / Replay System:** Implement a recording system to capture entity trajectories (positions, orientations, velocities) and event logs. Support exporting captured sessions to a payload (e.g. JSON), importing previous sessions, and replaying them dynamically with free camera controls and multiple viewing angles.
- **Modular Enemy AI Strategies:** Scaffold interfaces for different enemy types, profiles, and hunting behaviors (e.g., flanking, ambush, patrol patterns) to support multiple enemy configurations.
- **Occlusion-X-Ray / Player See-Through Rendering:** Implement stencil mask, outline rendering, or distance-based opacity transitions on dynamic boxes so the player is never visually occluded from the camera's perspective, while preserving physical collisions.


