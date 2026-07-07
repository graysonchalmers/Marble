# 🔵 Marble Game V2 — "Sonar Tag"

> This is a standalone clone on branch `v2`, kept separate from OneDrive to avoid sync conflicts with `node_modules` and build output. v1 (tag `v1.0.0`, branch `main`) lives at `OneDrive\Projects - Personal\Game-Marble`.

A 3D predator-prey game: you're a marble hunted by an AI sphere, and a **sonar audio system** — pitch and pulse encoding distance and closing speed — is your only radar.

## 🚀 Quickstart

Double-click **`Launch - Game Picker.bat`** for the version selector. Use **`Launch - Latest Version.bat`** for the default current build, or **`Launch - Box3D Beta.bat`** for the beta route.
V1 lives in the separate OneDrive repo via its own launcher on **:5173**. Run both for A/B comparison.

```bash
npm install
npm run dev -- --port 5174   # dev
npm run build                # single-file production build
npm run test                 # vitest (8 tests — engine loop + event bus)
```

## 🎮 Controls

- **WASD / Arrows** — move · **Space** — jump · **Mouse** — camera

## 📚 Docs

| Doc | What |
|-----|------|
| [docs/STATUS.md](docs/STATUS.md) | **Start here every session** — living truth: open phase, gates, evidence, known issues |
| [docs/PRD.md](docs/PRD.md) | Vision, pillars, scope, success criteria |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Target architecture: systems vs React, perf program |
| [docs/PLAN.md](docs/PLAN.md) | Phased build plan with exit gates |
| [docs/TUNING.md](docs/TUNING.md) | v1 earned tuning values (frozen reference — data, not code) |
| [docs/BOX3D_BETA_PLAN.md](docs/BOX3D_BETA_PLAN.md) | Parallel Box3D physics beta plan: shared resources, risks, phases, gates |
| [docs/BOX3D_BETA_HANDOFF.md](docs/BOX3D_BETA_HANDOFF.md) | Current blocker state, expected bridge artifacts, and the next developer handoff steps |


