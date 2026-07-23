# LOD, proxy and billboard architecture

## Status

The first production-safe vegetation distance system is implemented:

- Stable chunk-owned rock and tree manifests.
- Order-independent collision acceptance.
- Chunk-local terrain invalidation instead of global-world rebuilds.
- Projected-pixel LOD selection for orthographic editor and perspective player cameras.
- Full tree/rock meshes near the camera.
- Low-poly tree/rock proxies at middle distance.
- Cross-card tree billboards at far distance.
- Frustum-cullable instanced batches.
- Time-sliced grass generation.
- Density falloff for outer grass and flower rings.
- Automatic release of inactive grass buffers.
- Stable previous geometry while a same-chunk grass replacement is built.

The system intentionally does not bake impostor atlases during startup. Runtime
baking would delay the first interactive frame and make renderer initialization
fragile. A true textured impostor atlas remains an optional offline asset-quality
upgrade, not a prerequisite for extending view distance safely.

## Correctness contract

Every procedural object has a stable identity:

```text
kind:chunkX:chunkZ:candidateIndex
```

Candidates are accepted with a Matérn-II rule: a candidate survives only when
no overlapping candidate has a lower stable priority. This removes dependence
on focus-window traversal order, worker completion order and configured view
radius.

A chunk manifest may inspect one neighboring chunk in every direction, but it
returns only objects owned by the requested chunk. The same manifest is reused
by full meshes, proxies and billboards, so representations never teleport at a
LOD boundary.

Placed boulders and streamed procedural rocks are stable external blockers for
trees and grass.

## Invalidation

`StylizedChunkRevisionTracker` subscribes to world changes and keeps revisions
per terrain chunk.

- Tile edits dirty their owning chunk.
- Height vertices dirty every chunk sharing that vertex.
- Reset/load operations advance an epoch and invalidate all manifest caches.
- Each manifest includes a one-chunk revision halo because nearby candidates can
  influence boundary acceptance.

Edits outside the active LOD window no longer rebuild all visible trees and
rocks.

## LOD policy

Chunk residency is still expressed in chunk radii, while representation choice
uses projected object height in pixels.

Default tree policy:

| Band | Radius cap | Projected height |
|---|---:|---:|
| Full mesh | 1 chunk | at least 32 px |
| Low-poly proxy | 3 chunks | at least 8 px |
| Cross-card billboard | 4 chunks | at least 1.5 px |
| Cull | beyond 4 chunks or below 1.5 px | — |

Default rock policy:

| Band | Radius cap | Projected height |
|---|---:|---:|
| Full mesh | 1 chunk | at least 16 px |
| Low-poly proxy | 3 chunks | at least 1.5 px |
| Cull | beyond 3 chunks | — |

A 15% hysteresis margin prevents rapid switching near thresholds. Orthographic
selection uses camera zoom and vertical span. Perspective selection uses FOV,
viewport height and camera distance.

## Ground cover

Grass remains detailed only in its configured resident radius. The outer ring
uses a deterministic subset of the same blade samples, so density changes do
not reshuffle surviving blades.

Grass builds are resumable. Each queue entry processes a bounded number of
cells and leaves the previous same-chunk representation visible until the new
attributes are complete. A terrain-slot reassignment hides stale attributes so
old grass cannot appear at the new chunk position.

Inactive grass slots release their large CPU/GPU instance buffers after a short
idle period. With radius 1, retained heavy buffers are therefore bounded near
the active 3×3 window rather than accumulating across all 49 terrain slots.

Flowers use the same deterministic outer-ring density policy and hide stale
slot data during reassignment.

## Impostor atlas upgrade

A future textured tree impostor should be generated offline from the canonical
GLB and stored with an asset hash. Recommended starting point:

- 8 azimuth views × 2 elevation rows.
- 128×128 or 192×192 tiles.
- Shared atlas or texture array across prototypes.
- Albedo/coverage plus object-local normal.
- Mip-safe gutters, color dilation and alpha-coverage-preserving mipmaps.
- Instance yaw applied to lookup direction and decoded normal at runtime.

Do not use the previous 64-view, 256×256-per-view default. One 2048² RGBA8
target is 16 MiB before mipmaps. Albedo plus normal is about 32 MiB per prototype
and about 42.7 MiB with mipmaps. Four prototypes would approach 171 MiB.

Do not add a resident-only height API for far objects. The active height field
already samples overrides first and procedural terrain otherwise without
requiring a cached page. Manifest caching and worker generation are the relevant
performance controls.

## QA gates

Run:

```bash
npm test
npm run build
npm run qa:perf -- --qa chunk-cross --warmup 2 --duration 20 --speed run
npm run qa:perf:parse
```

Required checks:

- Identical chunk manifests when approached from different directions.
- No tree/rock movement when the focus window shifts without terrain edits.
- Edits outside the active LOD window do not increment tree/rock rebuilds.
- No grass build slice exceeds the configured cell count.
- Inactive grass resource count remains bounded after long-distance traversal.
- No stale grass or flowers appear when a terrain slot is reassigned.
- Tree and rock full-mesh counts remain bounded by their mesh radii.
- Proxy/billboard counts extend scenery without full-geometry growth.
- `stylized` p95/p99 and maximum improve over the pre-LOD chunk-cross baseline.
- Visual captures cover editor zoom, player walk, player strafe and high-angle orbit.

## Follow-up quality work

The next visual upgrade is the offline normal-mapped tree atlas described above.
Chunk-level canopy aggregation should be considered only when the far radius is
increased beyond the current four-chunk cap and measured billboard overdraw
becomes material.
