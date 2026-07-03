# 🔵 Marble Game V2 — "Sonar Tag"

> This folder is a **git worktree** on branch `v2`. The parent folder (`Game-Marble/`) holds the preserved v1 on `main` (tag `v1.0.0`). Both run side by side.

A 3D predator-prey game: you're a marble hunted by an AI sphere, and a **sonar audio system** — pitch and pulse encoding distance and closing speed — is your only radar.

## 🚀 Quickstart

Double-click **`launch_v2.bat`** (installs deps on first run, serves on **:5174**).
V1 lives one folder up via `launch_game.bat` (**:5173**). Run both for A/B comparison.

```bash
npm install
npm run dev -- --port 5174   # dev
npm run build                # single-file production build
npm run test                 # vitest (once Phase 0 lands)
```

## 🎮 Controls

- **WASD / Arrows** — move · **Space** — jump · **Mouse** — camera

## 📚 Docs

| Doc | What |
|-----|------|
| [docs/PRD.md](docs/PRD.md) | Vision, pillars, scope, success criteria |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Target architecture: systems vs React, perf program |
| [docs/PLAN.md](docs/PLAN.md) | Phased build plan with exit criteria |