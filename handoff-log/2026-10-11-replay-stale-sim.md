# 2026-10-11 — Replay start stepped a destroyed Box3D world (fixed, on v2)

Agent: claude-code (session run from Tool-BehaviorLab). Merged to origin/v2 as `363966e` (fix `761bf85`).

## Symptom
Starting a replay while a live sim existed threw `Error: Failed to read body transform` once or twice
(once also `Failed to cast ray`). Stack: `Box3DWorld.readBodyTransform` ← `MarbleSim.step` ← `tickSim` ←
`GameLoop.advance` ← `useFrame`.

## Cause (measured, not guessed)
- `startReplay()` flips `isReplaying` → the Box3DScene boot effect's cleanup runs `worldInstance.destroy()` at once.
- The replacement sim arrives only after the async `boot()` → `setSim`.
- For 2–3 frames in between, the registered `tickSim` (bound to the old sim, live branch) steps the dead world.
- Repro: headless Playwright with a real GPU, 6/6 runs, 15 errors. Every stale tick showed the old sim with `worldPtr 0`.
- The replay itself lost no frames: it started at frame 0 on the new sim every run.
- The new world reuses the same WASM `worldPtr` address (505760). A stale step can hit reused memory without
  throwing, so the guard is a flag and not a try/catch.

## Fix
- `Box3DWorld.isDestroyed`: set only by `destroy()`, never by `reset()`.
- `src/components/game-beta/simTick.ts` (`makeSimTick`): the old inline `tickSim`, moved out so it can be
  tested. Its first line returns when the world is destroyed, before any bridge call or replay-frame read.
  That covers live, setup, countdown and replay.
- No render path (`useFrame`, occlusion) calls into `sim.world`; `raycastClosest` runs inside `step`.
- Merge note: v2's belief-search port added `beliefSearch: s.beliefSearch` to the live params; that line now lives in `simTick.ts`.

## Evidence
- `simTick.test.ts`: the mock bridge fails reads on destroyed bodies, like the WASM does. Covers live, setup and
  replay, plus a positive control. With the guard removed, 3 of 4 fail with the production error.
- `npx tsc -b` is clean. `npx vitest run`: 151 passed, 2 skipped (on v2 after the merge). eslint: the same 3
  `Box3DScene.tsx` errors that are already on v2.
- Same repro after the fix: 0 errors in 6/6 runs, and the replay advances normally.

## Gotchas learned
- A hidden Claude browser pane runs no rAF, and swiftshader headless runs too slowly to hit the race. Use
  Playwright `channel: 'chromium'` with `--enable-gpu --use-angle=d3d11 --ignore-gpu-blocklist`.
- Stopping a background `npx vite` with TaskStop left `node` and `esbuild` running, and they locked the worktree.
  Find them by command line and kill them before retiring the worktree.
- `Clear-MergedWorktrees.ps1` used to check only against `origin/main`, so v2 merges looked unmerged.
  v1.4 (2026-10-11) counts the main checkout's branch/upstream and `-Base v2`.

## Not done
- `docs/STATUS.md` was not updated: another session has uncommitted edits to it in the main checkout.
  Fold one line in when that work lands: "replay start no longer steps a destroyed world (363966e)".
- The local `v2` ref in the main checkout is still at `44abc0b`; pull after that session commits.
