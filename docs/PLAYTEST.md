# 🎮 PLAYTEST — Feel & Visual Verdict Sheet (sessions 8–19)

> **Why this exists.** Every feature below is **code-verified** (tsc clean · vitest 113/113 ×5 · build clean) but **feel/visual-pending** — it's waiting on your judgment, not more engineering. This sheet is one sitting: launch once, rip through top-to-bottom, drop a verdict per row. Grouped by *what you touch together*, not by session number, so you're not bouncing around the settings panel.
>
> **Verdict shorthand:** 👍 ship it · 👎 kill/revert · 🔧 keep but tune (`_____`) · ⏭️ didn't get to it.
>
> **Launch:** `Launch - Box3D Beta.bat` (or `Launch - Latest Version.bat`). Box3D path = `?physics=box3d`. Settings = right-hand panel; DEV tools where noted.

---

## 0) 🚦 First 30 seconds — does it boot clean?

| Check | Look for | Verdict |
|---|---|---|
| Boots to countdown, plays | No black screen, no console spew | ☐ |
| No invisible ledge / phantom collider | Ball doesn't hit nothing near origin (Known #7 fixed s10) | ☐ |
| Restart is instant | R → back to countdown < 0.5s, no page reload | ☐ |

---

## 1) 🕹️ Core movement feel (the one you already loved — confirm it held)

Velocity-driven ball; 1:1 with the ground. You called this "holy shit amazing" at s6–7. Confirm nothing regressed.

| Do this | Look for | Verdict |
|---|---|---|
| Drive around, hard direction changes | Grips + translates 1:1, **no wheel-spin** | ☐ |
| Release keys mid-speed | **Drift/inertia** glide, settles on flat (`playerDrift` slider) | ☐ |
| Coast onto a slope | **Downhill roll** accelerates you down (not off cube tops) | ☐ |
| Jump (space) | Clears the enemy ball, **can't** summit a 7u cube (`jumpHeight`, def 1.8) | ☐ |
| DEV → Movement Tuning sliders | Top Speed / Accel / Brake / Air Control all respond live | ☐ |

**Dial-in note (what feels right?):** topSpeed `____` · accel `____` · drift `____` · downhill `____` · jump `____`

---

## 2) 👹 Enemy / difficulty

| Do this | Look for | Verdict |
|---|---|---|
| Stand still at start | Enemy catches you fast (velocity drive; F1 = 1.767s) | ☐ |
| Run from it | Chase ≈ 19.5 u/s at `enemySpeed 2` — fair but scary? | ☐ |
| DEV/Settings → enemy Speed / Reach / Accel | Tune to the difficulty you want | ☐ |
| Enemy size/weight sliders | Rebuilds live; bigger = more shove | ☐ |

**Target difficulty:** enemySpeed `____` — too easy / just right / too brutal (circle)

---

## 3) 🧱 Obstacles — cubes, columns, tilt, cylinders

| Do this | Look for | Verdict |
|---|---|---|
| Look at scattered cubes | Rest on terrain, **tilt** to slope (visual only) — reads natural or off? | ☐ |
| Look at columns (tall pillars) | Render as **cylinders**, lavender; density/height OK? | ☐ |
| Settings → Environment sliders | Cube Count/Scale + Column Count/Size/Height rebuild live | ☐ |
| Ram a cube / column | Collision feels solid (collider is a square box under both) | ☐ |

**Density call:** cubes `____` · columns `____` (more / fewer / good)

---

## 4) 👻 See-through modes — **pick the one that reads best**

Walk **behind a cube, then behind a tall column** (both occlude as of s16). Cycle `occlusionMode` in Settings → Visuals. You said the plain ghost was hard to read ("can't see the bottom edge / how I'm colliding") — that's why these exist.

| Mode | What it does | Reads well? |
|---|---|---|
| **Ghost** | ~40% transparent textured + faint edges | ☐ |
| **Wireframe** | Edges-only box, fully see-through | ☐ |
| **X-Ray** | Near face culled → see into far interior wall (depth + collision) | ☐ |
| **Silhouette** | Dark tinted fill + bright edges | ☐ |
| **Off** | No occlusion | ☐ |

**➡️ WINNER (set as default):** `________`   ·  Columns busy when several occlude at once? Y / N

---

## 5) 🪨 NEW (s19) — Physics Playground: props + bumpy floor

The showcase layer. Both in Settings → Environment (rebuild on change).

| Do this | Look for | Verdict |
|---|---|---|
| Plow through the scattered **props** | Knock-around rubble chunks react; "not a ball pit"? | ☐ |
| `propCount` slider (def 12) | Right amount of clutter — or too busy / too sparse? | ☐ |
| Watch the enemy near props | Props are "soft cover" — enemy swerves. Emergent, or does it look dumb? | ☐ |
| Drive over the **bumpy floor** | `terrainRoughness` (def 0.6) — mounds you feel, spawn ring stays smooth | ☐ |
| Coast over rough ground | Ball wanders over bumps (wanted) — or jittery/chaotic? | ☐ |

**Dial-in:** propCount `____` · terrainRoughness `____`   ·  props feel dumb near enemy? Y / N (if Y → drop count)

---

## 6) 🔊 NEW (s16) — Audio embodiment

Ball was silent; now it has a body. Additive/cosmetic. Tune volume to taste.

| Do this | Look for | Verdict |
|---|---|---|
| Roll around slow → fast | **Roll rumble** + **wind whoosh** scale with speed | ☐ |
| Hit a wall / cube | **Impact** sound fires | ☐ |
| Land a jump hard | **Landing** thud | ☐ |
| Overall mix | Too loud / too quiet / muddy under the sonar? | ☐ |

**Volume call:** roll `____` · wind `____` · impact `____` (up / down / good)

---

## 7) ✨ Particle FX (s8–9)

| Do this | Look for | Verdict |
|---|---|---|
| Drive fast on ground | **Roll trail** behind you (scales with speed) | ☐ |
| Slam a wall/cube | **Impact burst** | ☐ |
| Land hard | **Landing burst** | ☐ |
| Watch the enemy | **Red roll trail** + fading ember **breadcrumb** ("scent trail") | ☐ |

**Verdict:** too much / just right / more please

---

## 8) 🎚️ Play-feel presets (s8) — judge the flavors

DEV → Play-Feel dropdown. Each bundles physics + drift + downhill + jump + enemySpeed. Nudging any knob → `custom`.

| Preset | Your take | Keep? |
|---|---|---|
| **Classic** (baseline) | | ☐ |
| **Ice Rink** | | ☐ |
| **Arcade** | | ☐ |
| **Heavyweight** | | ☐ |
| **Predator** | | ☐ |

**Favorite / new default:** `________`   ·  any to cut? `________`

---

## 9) 🖥️ UI, flow & the control panel

| Do this | Look for | Verdict |
|---|---|---|
| Pause / game-over | Screen **freezes** (GPU stops spinning) — no wasted heat | ☐ |
| During countdown, press W/A/S/D | **Early release**: you break free, enemy stays pinned till timer hits 0 | ☐ |
| Finish a run outside top 5 | Game-over shows **`#N (You)`** zoom window vs neighbors (top-100 tracked) | ☐ |
| **Whole right-hand panel** | Every control actually does something now (s15 rewire — was "felt dead") | ☐ |
| Camera sliders (stiffness/offset) | Respond live | ☐ |
| Ground look + Shadows toggle | Respond live | ☐ |

**Control panel verdict (this was the big s15 fix):** works now 👍 / still something dead: `________`

---

## 🏁 Wrap — the 3 that matter most

1. **See-through winner:** `________`
2. **Difficulty (enemySpeed):** `________`
3. **s19 dial-in (propCount / roughness):** `________ / ________`

Anything that felt **wrong** (not just tune-able): `______________________________`

> Drop these back to me and I'll bake the winners into `DEFAULT_SETTINGS`, cut what you killed, and close the open stack in STATUS.md.
