# 🎛️ TUNING — v1 Earned Values (frozen reference)

> Snapshot of v1.0.0 tuned values as of 2026-07-02. These are **data, not code** — they encode months of feel iteration. V2 carries them verbatim as the default preset (ARCHITECTURE §5, PLAN Phase 1). If a v2 refactor changes any felt behavior, diff against this file first.
>
> Sources: `src/store/useGameStore.ts` `DEFAULT_SETTINGS` · `src/components/game/EnemyAI.ts` constants.

## Physics / movement

| Key | Value | Notes |
|---|---|---|
| gravity | **-22.5** | Much heavier than earth-scale; core to marble weight feel |
| worldScale | **0.75** | Global scale factor |
| friction | 0.35 | |
| restitution | 0.2 | |
| jumpForce | 5 | |
| moveSpeed | 8 | |
| playerTopSpeed | 20 | |
| playerAirControl | 0.1 | |
| enemyAirControl | 0 | enemy has none — grounded hunter |
| physicsRate | 120 | v1 setting; v2 loop owns the timestep instead |

## Enemy

| Key | Value | Notes |
|---|---|---|
| enemySpeed | 2 | base; multiplied by AI state |
| enemySize | 0.9 | |
| enemyMass | 2.5 | |
| useV2AI | true | |

## AI state machine (EnemyAI.ts constants)

| Key | Value | Notes |
|---|---|---|
| ALERT_DURATION | 0.5 s | lock-on delay before chase |
| SEARCH_DURATION | 5 s | per search cycle; then regenerates waypoints — never idles |
| VISION_DISTANCE | 25 u | distance-based visibility (no raycast in v1) |
| WAYPOINT_REACH_DIST | 2 u | |
| Speed multipliers | idle 0.0 · alert 0.1 · chase **1.5** · search **1.2** | |
| Chase prediction | `min(dist/15, 1.5)` s velocity lead | predictive interception |
| Search projection | `min(speed*2, 15)` u along player velocity; jitter ±2.5u if speed < 1 | first waypoint |
| Search spiral | radius 15u, angle step π/1.5, 3 extra waypoints, jitter ≤ 1.0 rad | waypoints 2–4 |
| State colors | idle #666666 · alert #ffcc00 · chase #ff0000 · search #ff8800 | readable-AI pillar |

## Sonar / audio

| Key | Value | Notes |
|---|---|---|
| audioStrategy | "drone" | default; "pulse" is the alt |
| masterVolume | 0.5 | |
| audioClosingVolume | 1.0 | threat channel dominates |
| audioOpeningVolume | 0.3 | |
| audioPingVolume | 0.6 | |
| audioToneVolume | 0.5 | |
| audioPingStyle | sine | |
| audioToneStyle | triangle | |
| audioClosingPitch | 300 Hz | base pitch, closing channel |
| audioOpeningPitch | 200 Hz | |
| audioClosingMaxDist | 150 u | |
| audioOpeningMaxDist | 150 u | |
| audioSolidDistance | 10 u | inside this, signal saturates |
| audioPitchModulation | 4 | |
| audioPitchEnabled / audioRateEnabled | true / true | distance→pitch and →rate both on |

## Level / camera / visuals

| Key | Value |
|---|---|
| cubeCount | 30 |
| cubeScale | 7 |
| cameraStiffness | 3 |
| cameraOffset | 15 |
| groundGridSize / cubeGridSize | 176 / 256 |
| groundColorBg / groundColorGrid | #70b348 / #3e6b1f |
| cubeColorBg / cubeColorGrid | #d3d3d3 / #404040 |
| uiAccentColor | #E53935 |
| shadowsEnabled / pixelRatio | true / 1 |

## Session-state spawn defaults

| Key | Value |
|---|---|
| enemy spawn | (0, 20, -15) — drops in from above |
| countdown | 5 s |
