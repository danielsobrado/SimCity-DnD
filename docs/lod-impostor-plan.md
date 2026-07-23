# LOD, impostor & billboard plan

Design for extending stylized-vegetation view distance without paying the full
3D instanced cost per chunk. This is the detailed version of item 6 ("distance
LOD for far chunks") in `docs/streaming-perf-plan.md`.

Everything here is grounded in the current renderer: WebGPU (`three/webgpu`)
with TSL node materials, deterministic scatter placement, and per-focus-chunk
`InstancedMesh` rebuilds.

## 1. Why

Today every stylized layer is rebuilt as full-geometry `InstancedMesh` batches
over a tiny resident window and nothing exists past it:

| Layer | Placement | `residentRadius` | Per-chunk count | Representation |
|-------|-----------|:---:|:---:|----------------|
| Trees | `StylizedTreeView.rebuild` | 1 (3×3) | `trees.perChunk` = 12 | trunk + leaf `InstancedMesh` per prototype |
| Rocks | `StylizedRockView.rebuild` | 1 (3×3) | `rocks.perChunk` = 5 | `InstancedMesh` per prototype |
| Flowers | `StylizedFlowerSlot` | 1 | `flowers.perChunk` = 480 ×2 variants | per-slot instanced quads |
| Grass | `StylizedGrassSlot` | 1 | `grass.bladesPerCell` = 48 | per-cell blades |

Two problems follow from `residentRadius: 1`:

1. **Hard visibility wall.** Trees/rocks simply pop into existence at the edge
   of the 3×3 window (~one chunk ≈ `chunkSize 64 × tileSize 2 = 128` world
   units away). There is no distant scenery.
2. **Rebuild spikes.** Pushing view distance by raising `residentRadius` scales
   the rebuild as `(2r+1)²` full-geometry instances — the perf QA already
   caught a ~948 ms `stylized` spike on a single rebuild. Radius 3 would be 9×
   the trees at full triangle cost.

The fix is to represent far instances **cheaply** — reduced-geometry LODs, then
pre-baked **impostors** (billboards that still look 3D), then flat billboards —
so we can extend view distance many chunks out at a small, near-constant cost.

## 2. Terminology (as used here)

- **LOD** — discrete swap between meshes of decreasing triangle count for the
  same object (LOD0 full → LOD1 reduced → LOD2 impostor). Chosen per instance
  by camera distance.
- **Impostor** — a camera-facing quad textured from a small atlas of the object
  pre-rendered from many directions (octahedral capture). Reads as a 3D object
  from most angles and supports normal-mapped lighting, unlike a flat sprite.
  Best for trees and other silhouette-rich objects.
- **Billboard** — a single quad, either camera-facing (spherical) or
  up-axis-locked (cylindrical), textured with one image. Cheapest; used for the
  farthest band and for objects that are already flat (flowers, grass tufts).

## 3. Distance-band scheme

One shared banding function maps an instance's camera distance to a
representation. Bands are expressed in **chunks** from the focus chunk so they
compose with streaming; converted to world units via
`chunkWorldSize = chunkSize * tileSize` (128 today).

| Band | Range (chunks) | Representation | Draw cost |
|------|:---:|----------------|-----------|
| `NEAR` | 0–`r0` | LOD0 full mesh (current path) | high, shadow-casting |
| `MID` | `r0`–`r1` | LOD1 reduced mesh (fewer leaf cards, no bark relief, no shadow) | medium |
| `FAR` | `r1`–`r2` | Octahedral **impostor** instanced quads | low (1 quad) |
| `BILLBOARD` | `r2`–`r3` | Single cylindrical billboard, tinted | minimal |
| `CULL` | > `r3` | not emitted | — |

Defaults to start (tunable in config): `r0=1, r1=3, r2=8, r3=14`. With
`chunkWorldSize 128` that is full detail to ~128 u, impostors to ~1 km, flat
billboards to ~1.8 km.

**Hysteresis.** Each boundary has a band-width overlap (e.g. ±0.35 chunk). An
instance only promotes/demotes after crossing the boundary plus the margin, and
the two adjacent representations **cross-fade** across the overlap (Section 6).
This kills the flicker/pop that naive distance thresholds cause.

## 4. Per-asset strategy

Not every layer earns every band. Priority is by silhouette cost × count.

### Trees — full LOD + octahedral impostor (highest value)

Trees are the tallest, most-visible, most-expensive silhouettes and the ones
that pop worst. They get the full ladder: LOD0 (current trunk+leaf), LOD1
(reduced leaf-card count and the trunk without bark parallax/relief, shadow
off), FAR octahedral impostor, BILLBOARD cylindrical card. Impostor bake per
tree prototype (Section 5).

### Rocks — 2-LOD, optional impostor

Rocks are low and rounded; silhouette barely changes with distance. Give them
LOD0 and a decimated LOD1 (flat-shaded, already `flatShading: true`), and let
them fall to a **billboard** at FAR rather than a full octahedral bake — the
bake cost isn't justified. Impostor is a stretch-goal only if rock density rises.

### Flowers — distance fade + density falloff (no bake)

Flowers are already flat instanced quads. No impostor needed. Instead: (a) fade
alpha to zero across the last resident ring so they dissolve instead of
vanishing, and (b) reduce `perChunk` with distance (emit every Nth deterministic
sample by ring). This extends apparent coverage cheaply and removes the flower
build spikes at range.

### Grass — density falloff + fade only

Grass never becomes an impostor. Apply the existing per-cell build with a
distance-driven `bladesPerCell` falloff and an alpha/shell fade at the resident
edge, plus optional merge into a tinted ground-color term beyond the grass ring
(handled in `StylizedSurfaceView`/ground material, not here).

## 5. Impostor bake pipeline (trees)

Prototypes are loaded at runtime from the shared GLB
(`StylizedTreeView.buildFromScene`), so **bake once at startup** into a GPU
atlas rather than shipping pre-baked textures (keeps art pipeline single-source
and self-updating). `terrainView.renderer` is the live `WebGPURenderer` we can
render offscreen with.

### 5.1 Octahedral capture

For each tree prototype:

1. Compute a tight bounding sphere from the prototype parts' geometry bounds.
2. Choose an atlas grid `N×N` of views (start `N=8` → 64 views). Map grid cell
   `(i,j)` to a direction via **hemi-octahedral** unwrap (trees are only ever
   seen from at/above the horizon, so a hemisphere doubles texel density vs a
   full octahedron).
3. For each direction, render the prototype with an orthographic camera looking
   at the sphere center, framed to the sphere radius, into an atlas tile.
4. Capture to a **multi-target** offscreen buffer:
   - `albedo.rgb` + coverage in `.a` (alpha mask).
   - `normal.rgb` (view-independent world normal, encoded `*0.5+0.5`).
   - optional `depth` (for parallax / soft-blend), packable into `normal.a`.

Atlas size: 64 views × 256² tiles = 2048² per target — one albedo + one normal
atlas per prototype. With a handful of prototypes this is a few MB; cap total
atlas memory in config and drop tile resolution if exceeded.

### 5.2 Render at FAR

Impostors render as one `InstancedMesh` of unit quads per prototype (per band),
with a TSL node material that:

1. Orients the quad to face the camera (billboard in vertex stage), scaled to
   the prototype's world size and lifted so the trunk base sits on the ground.
2. From the view direction, computes the **nearest octahedral cell** (or the 3
   surrounding cells for hemi-octahedral blend) and its atlas UV; samples
   `albedo`/`normal`.
3. Alpha-tests on coverage (`< 0.5` discard) for a crisp silhouette; optionally
   dithers the alpha edge for softness.
4. Lights using the decoded normal against the same `sunDirection`
   (`StylizedSkyView`) and fog so impostors match nearby lit meshes.
5. Applies a cheap wind sway (reuse tree wind uniforms) as a horizontal offset
   so distant canopy motion reads continuously with LOD0.

**3-cell blend** removes the "view snapping" you get sampling a single tile when
the camera orbits; it triples texture reads but they're distant pixels. Start
with nearest-cell and enable blend if snapping is visible.

### 5.3 Shadows

Impostors do **not** cast real shadows (their trunks are quads). Options, cheap
→ expensive: (a) no shadow past MID — acceptable at range; (b) a flat radial
"blob" shadow decal on the ground under each impostor; (c) render impostor
alpha into the shadow map as a quad. Recommend (a) for v1, (b) as polish.

## 6. Anti-pop transitions

Two mechanisms, both driven by the banding function:

- **Hysteresis** (Section 3) so an instance near a boundary doesn't oscillate.
- **Cross-fade** across each band's overlap: both representations are drawn and
  their alpha is ramped (LOD0 fades out `1→0` while impostor fades `0→1`) using
  a screen-door **dither** (hashed per instance) so no true transparency sorting
  is needed. Because placement is deterministic and identical across bands
  (Section 7), the two representations occupy the exact same spot — the fade is
  a clean dissolve with no doubling or gap.

Fade width and hysteresis margin are config knobs; both default to ~0.35 chunk.

## 7. Placement architecture — one deterministic source of truth

The critical correctness rule: **near mesh and far impostor must place the same
instance at the same transform**, or objects duplicate/teleport across a band
boundary. Today placement logic is duplicated inside each view's `rebuild`
(`StylizedTreeView`, `StylizedRockView`) using
`scatterRandom01(chunkX, chunkZ, index, channel)`.

Refactor to a shared **placement iterator** that both bands consume:

```
scatterInstances({ focusChunk, radius, perChunk, tileIds, tileMap,
                   heightAt, clearRadius, rockPlacements })
  -> yields { canonicalX, canonicalZ, height, scale, rotationY,
              prototypeIndex, chunkX, chunkZ, index }
```

- Extract the existing loop bodies verbatim (same seeds/channels → identical
  results, so nothing visibly moves on refactor).
- A **band manager** iterates this once over the *max* radius (`r3`), computes
  each instance's camera distance, assigns a band (with hysteresis), and pushes
  the transform into that band's instance buffer.
- Each band owns its own `InstancedMesh` set; per frame only bands whose ring
  membership changed are rewritten (far bands change rarely). Reuse
  `StylizedBuildQueue` to keep per-frame rewrites budgeted, exactly like grass.

This also lets us thin far density (emit every Nth `index` per ring) in one place.

### 7.1 Height availability constraint (important)

`heightAt` today is `terrainView.getCanonicalHeight`, which needs the chunk's
heights to be **CPU-resident**. Resident radii from config:

- `maxResidentChunks: 49` → GPU-resident ~7×7 (radius 3)
- `maxCpuChunks: 81` → CPU cache ~9×9 (radius 4)

So impostors can extend to **radius ~4** using cached heights with zero new
infrastructure. Beyond that (our `r2=8`, `r3=14`) there is no height to place on.

Two-phase answer:

- **Phase A (radius ≤ 4):** ship LOD + impostors within the CPU-resident window.
  Big visual win, no new height source.
- **Phase B (radius > 4):** use a **resident-independent** height sample. This
  is nearly free because the generator already exposes
  `ProceduralWorldGenerator.sampleHeight(vertexX, vertexZ)`, and
  `InfiniteWorldStore` already reads it as the base for `getHeight`
  (override ?? `generator.sampleHeight`). We just need a path that does **not**
  require a CPU-resident page: add a thin `worldStore.sampleBaseHeight(cellX,
  cellZ)` that returns the pure generator height (ignoring the override maps),
  and use it as `heightAt` for bands beyond the CPU radius. It's approximate
  (ignores user edits) but distant procedural terrain reads fine.

## 8. Integration points

- **Floating origin.** Impostor/LOD roots follow the same
  `root.position.set(-origin.x, 0, -origin.z)` pattern the tree/rock roots
  already use, so rebases are free.
- **Update loop.** Bands update inside `StylizedSurfaceView.update(timestamp,
  camera)` — the camera is already passed in. Distance uses the camera world
  position vs instance world position (both in render space).
- **Rebuild keying.** Extend the existing `lastUpdateKey`
  (`chunkX:chunkZ:revision:signature`) with a per-band ring hash so a band only
  rebuilds when its membership actually changes.
- **Perf marks.** Reuse the `stylized` phase mark; add counters (Section 10).

## 9. Config schema additions

New `stylizedSurface.lod` block in `editor.config.yaml`:

```yaml
stylizedSurface:
  lod:
    enabled: true
    bands:                 # ring radii in chunks
      near: 1              # r0
      mid: 3               # r1
      far: 8               # r2  (impostor)
      billboard: 14        # r3
    hysteresisChunks: 0.35
    fadeChunks: 0.35
    impostor:
      viewsPerAxis: 8      # N (N*N captured directions)
      tileResolution: 256  # px per view
      hemiOctahedral: true
      blendCells: false    # 3-cell blend; start false
      maxAtlasBytes: 33554432   # 32 MB cap across prototypes
    trees:  { lod0: 1, lod1Mid: true, impostorFar: true, billboard: true }
    rocks:  { lod1Mid: true, billboardFar: true, impostor: false }
    flowers: { fadeRing: true, farDensity: 0.35 }
    grass:  { fadeRing: true, farDensity: 0.4 }
```

Validation (in `validateEditorConfig.js`, all optional): `lod.enabled` boolean;
`bands.*` positive integers strictly increasing (`near < mid < far <
billboard`); `hysteresisChunks`/`fadeChunks` non-negative and below the smallest
band gap; `impostor.viewsPerAxis` integer ≥ 2; `tileResolution` power-of-two in
[64, 1024]; `maxAtlasBytes` positive. Follow the existing optional-key pattern
(e.g. how `maxCommitsPerFrame` is checked) — the loader passes unknown keys
through untouched, so no whitelist edits are needed.

## 10. Perf & QA

- **New counters** (`PerfCounters`): `treeImpostorRebuilds`,
  `treeLodMidRebuilds`, `bandInstanceCount` per band, `impostorBakeMs` (one-off).
- **Draw-call check.** Target: each band = 1 instanced draw per prototype.
  Total stylized draws should stay roughly flat as view distance grows (that's
  the whole point) — assert in the perf report.
- **Reuse the harness.** Extend `docs/perf-qa.md`'s `chunk-cross` run: with LOD
  on, the `stylized` phase spike on boundary crossings should shrink (far rings
  rewrite quads, not geometry), and avg triangles/frame should drop sharply vs a
  naive `residentRadius: 8`.
- **Bake budget.** `impostorBakeMs` is a startup cost; keep it off the first
  interactive frame (bake during the existing `bootstrapLayers` await, show
  near LOD0 meanwhile).

## 11. New / changed files

| Path | Role |
|------|------|
| `src/editor/stylized/lod/bandPlan.js` | Pure banding: distance → band + fade weight, with hysteresis. **Unit-tested.** |
| `src/editor/stylized/lod/scatterInstances.js` | Shared deterministic placement iterator (extracted from tree/rock rebuild). **Unit-tested.** |
| `src/editor/stylized/lod/octahedral.js` | (hemi-)octahedral dir↔cell↔UV math. **Unit-tested.** |
| `src/editor/stylized/lod/ImpostorBaker.js` | Runtime GLB→atlas bake via `terrainView.renderer`. |
| `src/editor/stylized/lod/ImpostorMaterial.js` | TSL node material: billboard + atlas sample + lit + fade. |
| `src/editor/stylized/lod/StylizedBandManager.js` | Iterates placement, assigns bands, owns per-band `InstancedMesh`, budgeted rewrites. |
| `src/editor/stylized/StylizedTreeView.js` | Emit LOD0/LOD1; delegate FAR/BILLBOARD to band manager. |
| `src/editor/stylized/StylizedRockView.js` | LOD1 + billboard far. |
| `src/editor/world/InfiniteWorldStore.js` | `sampleBaseHeight` — thin wrapper over the existing `generator.sampleHeight` that skips resident/override lookup (Phase B). |
| `editor.config.yaml` / `validateEditorConfig.js` | `lod` config + validation. |

## 12. Testing strategy

- **Placement parity (unit).** `scatterInstances` reproduces the exact
  transforms the current `StylizedTreeView.rebuild` produces for the same focus
  chunk (guards the refactor — nothing moves).
- **Band assignment (unit).** `bandPlan`: correct band per distance; hysteresis
  prevents oscillation across a boundary sweep; fade weight is continuous and
  sums to 1 across the overlap; no instance appears in two non-overlapping bands.
- **Octahedral math (unit).** dir → cell → UV → dir round-trips within one
  texel; hemi vs full mapping covers the intended hemisphere; atlas UVs stay in
  tile bounds.
- **Determinism.** Same seed ⇒ identical band buffers across runs (matches the
  project's existing determinism tests).
- **Visual / golden (headed QA).** Extend the Playwright perf runner to grab a
  screenshot at a fixed pose with LOD on; eyeball impostor silhouette vs LOD0
  and check for a clean cross-fade (no doubling, no gap) while walking a
  `chunk-cross` path.
- **Perf gate.** `npm run qa:perf -- --qa chunk-cross`: `stylized` boundary
  spike and triangles/frame both down; draw calls near-flat vs distance.

## 13. Phased roadmap

Each phase is independently shippable and testable.

1. **Placement refactor.** Extract `scatterInstances`; retarget tree & rock
   `rebuild` onto it. No behavior change — parity test is the gate.
2. **Band plan + hysteresis + fade.** Add `bandPlan.js` and the dither cross-fade
   in existing materials. Wire a NEAR/MID split for trees (LOD1 = reduced leaf
   cards, no shadow). Ships mid-distance detail with no bake.
3. **Impostor bake + material (trees).** `octahedral.js`, `ImpostorBaker`,
   `ImpostorMaterial`; FAR band for trees within CPU-resident radius (Phase A).
   This is the headline visual win.
4. **Band manager + rocks/flowers/grass falloff.** Generalize to
   `StylizedBandManager`; rock LOD1 + billboard; flower/grass ring fade + density
   falloff.
5. **Extended radius (Phase B).** `sampleBaseHeight` from the generator; push
   `far`/`billboard` bands past radius 4. Optional blob shadows.

Recommended stopping point for a first release: **phases 1–3** (real mid detail
+ tree impostors to ~radius 4). Phases 4–5 are range/polish.

## 14. Risks & trade-offs

- **WebGPU MRT bake** (albedo+normal in one pass) is the trickiest new code; if
  it fights the `three/webgpu` node pipeline, fall back to two single-target
  bake passes.
- **Normal encoding / lighting match.** Impostors can look flat or mis-lit if
  the baked normal atlas or fog term drifts from LOD0; keep them on the same
  `sunDirection`/fog uniforms and validate with the golden screenshot.
- **View snapping** at low `viewsPerAxis`; mitigate with 3-cell blend or a
  higher `N` (memory trade-off, capped by `maxAtlasBytes`).
- **Determinism drift.** Any change to scatter seeds/channels in the refactor
  moves every object; the parity test must run first and stay green.
- **Edited terrain vs Phase B.** Pure-generator far heights ignore user edits;
  acceptable at distance, but don't use `sampleBaseHeight` inside the edited
  near window.

## 15. Open decisions

- Target max view distance (sets `r3` and whether Phase B is needed at all).
- Fidelity vs memory for the impostor atlas (`viewsPerAxis`, `tileResolution`).
- Whether rocks ever justify an octahedral bake or stay billboard-only.
- Blob shadows for impostors in v1, or defer.
