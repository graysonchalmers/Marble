# Render subtraction cylinder — 2026-10-07

Built locally: reusable render volume, camera/player preset, and interactive lab.
Follow-up: user accepted the stippled texture; preserve it. Expanded gameplay
participation and added cylinder/capsule shape control.
No physics changes or publication in this session.

## Try it

- Run the existing launcher or `npm run dev -- --port 5174`.
- Add `?lab=subtraction` to the URL for the standalone lab.
- Gameplay: Settings → Visuals → See-Through Obstacles → Soft cylinder (local cut).
- Gameplay defaults: radius **0.85 world units**, outward feather **0.65**.
- Cut Shape switches between flat-ended cylinder (default) and rounded capsule.
- Lab defaults: A=(0,1.5,6), B=(0,1.5,-4), radius=1, feather=0.65.
- Adjust either endpoint independently, orbit the view, or enable Camera → target.
- Enable subtraction is an A/B toggle. Reset restores the original arbitrary-endpoint volume.

## Behavior and API

`src/systems/render/subtractionVolume.ts` holds the geometry and shader adapter.
`src/components/game-beta/RenderSubtraction.tsx` applies the adapter to scene mesh materials.

```ts
const volume = createSubtractionVolume()
volume.start.set(2, 4, 8)
volume.end.set(-3, 1, -5)
volume.radius = 1
volume.feather = 0.5
volume.enabled = true
// Inside an R3F Canvas:
// <RenderSubtraction volume={volume} />
```

The default volume is a finite cylinder with flat end caps; `shape='capsule'`
adds hemispherical ends centered on the endpoints. Its interior
disappears; visibility rises with smoothstep over the outward feather, including
the end caps. Zero feather produces a hard cut. Coincident endpoints disable the
cut rather than dividing by zero. Runtime endpoints are mutable Vector3s;
the radius, feather and enabled flag are refreshed at draw time. On a demand-render
Canvas, call `invalidate()` after modifying a volume.

The shader evaluates world-space surface positions, including instance transforms.
It preserves the existing material lighting, texture, color and instance tint.
The feather uses stable screen-space dithered discard so ordinary opaque depth
ordering remains intact. It is stippled rather than blended transparent glass.

Only the main camera sees the subtraction. Depth/shadow materials are unchanged,
and reflection cube-camera draws explicitly disable the cut. Physical collision
and simulation/replay state remain intact. This is surface masking, not boolean
geometry: it creates no interior faces or cut caps.

Scene objects opt out with `userData={{ subtractExclude: true }}`. The gameplay
player opts out. Terrain, enemy, cubes, columns, pyramids, props, crumble blocks,
debris, particles and path trails participate. The legacy occlusion component treats cylinder mode as
no whole-object reveal while retaining dead-instance handling. Existing ghost,
wireframe, xray, silhouette and off modes remain selectable.

The controller patches built-in mesh, PointsMaterial and line materials. Points
are masked by their world-space centers, rather than reconstructed sprite surfaces.
Custom ShaderMaterial effects and sprites need a separate adapter. Materials shared between
exempt and participating meshes should be cloned first. One active volume per
controller/scene is supported; multiple-volume composition is deferred.

Settings schema 13 adopts cylinder mode for existing ghost/default saves; other
selected legacy modes remain unchanged. The new numeric keys merge from defaults.

## Validation

- `npm run build`: TypeScript + Vite passed; single-file output 1,310.96 kB.
- `npm test` outside the Windows filesystem sandbox: **145/145**, 22 files.
  Four geometry tests cover core/feather/end caps, arbitrary axes, degenerate inputs,
  and cylinder versus capsule beyond an endpoint.
- Sandbox-restricted test workers failed with Windows `EPERM realpath`; the native
  rerun passed. Existing headless Web Audio warning and WASM streaming fallback remain.
- Headless Edge via bundled Playwright (Browser plugin unavailable), local built
  preview at `http://127.0.0.1:5181`, desktop 1440×900 and mobile 390×844.
- Page identity/content, no framework overlay, no page/console errors. Edge emitted
  shader compiler precision/division warnings; no shader compile failure was observed.
- Enable toggle changes canvas pixels; reset restores the exact original canvas
  screenshot after using the camera preset. Radius, feather and endpoint controls,
  camera preset, tiled instanced wall and responsive panel visually checked.
- Follow-up: capsule selector, optional lab particle/line field, cut versus solid
  screenshots and gameplay cylinder/capsule switching verified with no console errors.
- Live gameplay reached after the countdown; movement input exercised and captured
  in `game-playing.png`. This is a brief smoke check, not full gameplay acceptance.
- Gameplay boot, radius/feather controls, cylinder → ghost → cylinder and Start smoke
  checked. This is not full replay, device, performance or visual acceptance.

Evidence and the rerunnable QA script are outside the repo:
`C:/Users/Grayson/.codex/visualizations/2026/10/07/01a11754-0d7c-7ee2-9668-ac43b1db9afb/`.

## Next review

The user accepted the stippled texture. Review the expanded gameplay cut and
tune radius/feather. Potential next work: custom shader/sprite adapters, several
composable volumes or additional SDF shapes. No performance result is claimed.
