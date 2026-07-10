# 🔊 AUDIO — design & critical review

> **Where this lives:** durable design reference (like `ARCHITECTURE.md`), not live state. `STATUS.md` tracks what's shipped/verified; this file holds the *why* and the roadmap for sound. Started session 16 (2026-07-10).

The engine is 100% **procedural Web Audio** (synth + filtered noise) — no sample assets. Everything routes through `audio/SoundManager.ts` → a single `masterGain` → destination.

---

## 1. 🎛️ Current inventory

| Sound | Trigger | Synth | Role |
|---|---|---|---|
| Countdown beep | each count | 800Hz sine | UI |
| Go signal | round start | 600+900Hz chord | UI |
| Sonar hum/ping | **continuous**, enemy proximity | sine, pitch+volume ride distance/closing-speed | **information** |
| Solid tone | enemy < 10u | 1500Hz+ scream | **information** (panic) |
| Alert | AI idle→alert | rising square | tell |
| Lost | AI chase→search | descending sine | tell |
| Tag / caught | `onTag` | `playBonkSound` (80→10Hz saw) | feedback |
| Spatial ping | (available) | HRTF-panned sine | information |
| **Roll rumble** | continuous, grounded speed | lowpass noise | **embodiment** *(session 16)* |
| **Wind whoosh** | continuous, total speed | highpass noise | **embodiment** *(session 16)* |
| **Impact** | `onImpact` (object/wall hit) | bandpass-noise clack + sine thump | feedback *(session 16)* |
| **Landing** | `onLand` (touchdown) | sine thud + dust puff | feedback *(session 16)* |

---

## 2. 🔬 Critical review

**The core insight (first principles):** this is a **sonar-driven stealth-tag game**. Audio isn't juice here — for the sonar, it *is the primary sensor*. That splits the whole soundscape into two jobs that compete for the same ears:

- **Information** — the sonar/solid-tone/alert/lost channel tells you *where the enemy is and whether it's closing*. Losing this = losing the game. It must stay legible.
- **Embodiment** — roll/wind/impact/landing tell you *what your body is doing*. This is feel/immersion (the same lane the velocity-movement + particle work lives in).

Judged against that frame:

**✅ Strong**
- The **information channel is genuinely well-designed** — closing/opening split, quadratic distance falloff, a distinct "too close" solid tone. That's real game-feel thinking, not just beeps.
- Procedural-only = **zero asset pipeline, tiny bundle, infinitely tunable** — matches the project's "synth the feel" ethos.

**⚠️ Weak / gaps (before session 16)**
1. **No embodiment layer at all.** The ball was silent — no roll, no impact, no landing, no air. A fast heavy marble that makes no sound reads as weightless. *(Fixed s16.)*
2. **No mix discipline.** Everything sums into one `masterGain` at full tilt. With the sonar hum *always* playing, adding more voices risks **masking the sensor** — the one sound you can't afford to lose. There's no ducking, no per-bus headroom, no sidechain.
3. **`onImpact`/`onLand` fired particles but no sound** — the hooks existed (from the FX work), half-wired. *(Fixed s16.)*
4. **Impacts aren't spatialized.** `playSpatialPing` exists (HRTF), but hits play centered — you can't hear *which side* you clipped a pillar.
5. **No surface/material variation.** Rolling on terrain vs a cube top sounds identical; no concept of surface.
6. **Audio settings are sonar-only.** No player control over the new embodiment layer (volume, on/off) yet.

---

## 3. 🆕 Session-16 SFX layer (what shipped)

Added the **embodiment layer**, all **additive & cosmetic** (zero determinism impact — same safety class as the particle system; sim events are already cosmetic):

- **Rolling rumble + wind** — two looping white-noise voices (roll→lowpass, wind→highpass) whose gain/timbre track the ball each frame via `SoundManager.updateMovementAudio()`. Torn down on pause/gameover.
- **Impact** (`playImpact`) — bandpass-noise clack + sine thump, scaled by the hit's horizontal speed-drop. Wired to `onImpact` (cube/column/wall).
- **Landing** (`playLanding`) — sine thud + dust puff, scaled by touchdown speed. Wired to `onLand`.

**The testable seam:** Web Audio can't run headless, so the *decision* (speed → gain/cutoff) is a pure function — **`audio/movementAudio.ts` `computeMovementAudioParams()`**, unit-tested in `movementAudio.test.ts` (6 cases: silent at rest, roll rises + brightens with speed, no roll airborne, saturates at cap, wind threshold + ramp, wind louder airborne). Same pattern as `occlusion.ts`/`records.ts`. `SoundManager` just applies the returned numbers.

**Tuning:** all constants live in `MOVEMENT_AUDIO` (`movementAudio.ts`) + inline in the one-shots — safe to dial. Not yet exposed as in-game sliders (see backlog).

---

## 4. 🎚️ Mix philosophy (the rule to hold)

**The sonar is sacred.** Every embodiment voice is deliberately quiet (roll peaks ~0.16, wind ~0.11, vs sonar tone at full) and lives in a *different frequency band* (roll = low rumble, wind = high air, sonar = mid tone) so they don't mask the sensor. If the mix ever gets crowded, the fix is **duck embodiment under the sonar**, never the reverse.

---

## 5. 🗺️ Backlog / open questions

| Item | Why | Risk |
|---|---|---|
| **Sidechain/duck** embodiment under sonar + solid-tone | protect the sensor as voices grow | med (needs a bus refactor) |
| **Spatialize impacts** (route `playImpact` through a panner at the hit point) | hear which side you clipped | low |
| **Per-surface friction** (terrain vs cube-top vs column) | richer embodiment; needs sim to tag contact surface | med |
| **Enemy audio** beyond the tag — its own roll/breath as it closes (spatial) | dread/telegraph without looking | med |
| **Expose audio settings** — master SFX volume + roll/wind/impact toggles in SettingsMenu | player control; currently sonar-only | low |
| **Air-whoosh on fast turns**, jump-launch "whoomph" | more motion feedback | low |
| Samples vs synth for impacts (a real "clack" is hard to synth) | fidelity ceiling | med (breaks asset-free) |

**Decision pending (Grayson):** keep **100% procedural** (asset-free, infinitely tunable, but a synth "clack" only gets so real), or allow a **small sample set** for impacts/surfaces (better fidelity, adds an asset pipeline)? Everything above is designed to work either way.
