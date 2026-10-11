# Enemy AI: last-seen fix + belief-map search (branch `lab-port/belief-search`, 2026-10-11)

Ported from Tool-BehaviorLab (`C:\Projects-local\Tool-BehaviorLab`), where Marble's `EnemyAI` is mirrored 1:1 and
compared against new brains. Two changes, in four commits on top of `v2` @ `44abc0b`.

## 1. Fix: the AI only gets what it has seen (`babd57a`, changes default behavior)
`MarbleSim` passed the live `playerPosRef.current` / `playerVel` to `updateAIState` and `getMovementTarget` on every
AI tick, seen or not. On `alert -> search` that wrote the player's true unseen position into `lastKnownPlayerPos`,
and the search waypoints were seeded with the live velocity. Now MarbleSim keeps `lastSeenPos` / `lastSeenVel`,
refreshed only when `canSee`, and passes those.
- Proof: a no-cheat test (real WASM). Chase, then teleport the player out of view to spot A vs B with different
  velocities; enemy paths must be identical. Restoring the live values fails it.
- F1 unchanged (1.750 s). The leak was small (one 0.1 s AI tick), but it was information the enemy shouldn't have.

## 2. Belief-map search, behind a flag (`b04520c`, `84ed8c1`, `4ce1e7c`; default off)
`SimParams.beliefSearch` / setting `beliefSearch` (Dev Tools > Debug Visuals > **AI Belief Search**; schema v13).
- **Grid:** while searching, the enemy heads for where the player most likely is. It's a 4 u XZ probability grid
  (`src/systems/ai/beliefSearch.ts`, pure, no RNG).
- **Each AI tick:** the grid spreads at the player's top speed. It collapses onto the player on a sighting, and
  otherwise clears every cell the enemy can see (raycast to player height over the terrain there).
- **Target:** the cell with the best belief per distance. Cube and column footprints are closed; pyramids stay open.
- **Untouched:** the state machine and speeds. Only the search-state target changes.
- **Flag off:** nothing runs. Catch and re-sight times are identical to `babd57a` on 40 seeds.
- **Overlay:** the AI Vision Overlay shows the belief as heat and hides the spiral waypoints while belief steers.
  Replays record the flag.

### Measurement (`src/systems/ai/beliefSearch.measure.test.ts`, skipped unless `MEASURE=1`)
- **Setup:** each match is built like `Box3DScene` (default settings, physics preset, props, crumble blocks, live
  params).
- **Scenario:** the enemy sees and chases the player. Then the player slips out of view to a seeded spot at least
  45 u away and holds still.
- **Pre-registered:** explore on seeds 1-30, grade once untuned, judged by a sign test on paired seeds.

| Seeds | Belief catches sooner / later | Caught (belief vs spiral) | Median catch |
|---|---|---|---|
| 301-500 (game-faithful config) | 128 / 69, p ≈ 2e-5 | 194 vs 80 of 200 | 14.8 s vs 60 s (cap) |
| 101-300 (first harness, sim defaults) | 149 / 50, p < 1e-4 | 199 vs 72 of 200 | 14.4 s vs cap |

The spiral never searches more than ~15 u from the last-known spot, so a player who slips further away is usually
never found. Even with a 180 s cap it found only 74/200. Belief search sweeps outward from where the player was
seen. It is sometimes *later* (69/200), when the spiral happens to land on a nearby player first.

```
MEASURE=1 FROM=301 SEEDS=200 npx vitest run src/systems/ai/beliefSearch.measure.test.ts
CAPTURE=1 OUT=<dir> npx vitest run src/systems/ai/beliefSearch.measure.test.ts   # matched before/after replays
```

### In-game capture
- **Method:** two replays with the same header, inputs and params; only `beliefSearch` differs.
- **Scenario:** layout seed 26. The player runs north during the countdown head start, then stops behind a pyramid.
- **Result:** with the spiral, the enemy circles the pyramid for 30 s without finding the player. With belief search
  it catches at 9.4 s.
- **Files:** in `Tool-BehaviorLab\.proof\2026-10-11-marble-port\` (videos, stills, the replay JSONs).

## Gate
- tsc clean.
- vitest 147 passed, 2 skipped (the measurement / capture suites). The baseline at `44abc0b` was 139.
- `npm run build` 1.30 MB.
- No new lint errors.

## Not done / heads-up
- **Not merged into `v2`.** The main checkout has another session's uncommitted work (Box3D bridge rebuild,
  `Box3DScene.tsx`, `SettingsMenu.tsx`, docs). Expect small conflicts in `Box3DScene.tsx` (one params line) and
  `persistence.ts` (schema version) if that work also bumps the schema.
- **Pre-existing race, not fixed here:** starting a replay while a live sim exists can throw
  `Failed to read body transform` from `MarbleSim.step` for a frame or two. The loop ticks the old sim after its world
  is destroyed. It shows up in both arms of the capture; the replay still plays to the end.
- **STATUS line to add at merge:** `Enemy AI last-seen fix ✅ (no-cheat test) · Belief-map search 🔌 flag, default
  off (held-out 128/69, p≈2e-5; caught 194 vs 80 of 200) · see docs/BELIEF_SEARCH.md`
