# Vegetation LOD, impostors and ground-cover pipeline

## Implementation status

All planned phases are implemented in the renderer and asset pipeline.

| Phase | Status | Delivered |
|---|---|---|
| 0 — correctness and measurement | Complete | Stable focus contract, projected-size policy, counters, memory gauges and regression tests |
| 1 — stable chunk manifests | Complete | Chunk-owned deterministic manifests, order-independent collision acceptance and local invalidation |
| 2 — ground-cover optimization | Complete | Grass clumps, influence textures, sliced builds, density falloff, resource release and combined flower batches |
| 3 — mesh LOD | Complete | Near meshes, simplified proxies, screen-space selection, hysteresis and dithered transitions |
| 4 — impostors and canopy clusters | Complete | Multi-view albedo/normal tree atlases, runtime fallback baker, reproducible offline export and extreme-distance canopy clusters |
| 5 — GPU-driven culling | Complete | WebGPU compute frustum compaction and indirect impostor draws with a CPU fallback |

## Representation ladder

Tree representation is selected from projected height and capped by chunk radius:

1. Full source mesh in the near band.
2. Reduced geometric proxy in the middle band.
3. Multi-view normal-mapped impostor in the far band.
4. One aggregated canopy proxy per chunk in the extreme band.
5. Cull beyond the configured cluster radius.

Rocks use full meshes near the camera and reduced geometric proxies farther out.
Grass and flowers use deterministic density falloff rather than object impostors.
The terrain material carries procedural far-ground detail after geometry ends.

Both orthographic editor zoom and perspective player distance are handled by the
same projected-pixel policy. Previous and next representations overlap during a
stable screen-door transition, so no transparency sorting is required.

## Stable placement

Procedural trees and rocks use chunk-owned manifests. Every candidate has a
stable identity and priority. A candidate survives only when no intersecting
candidate has a lower priority. The result is independent of:

- focus-window traversal order;
- worker completion order;
- LOD radius;
- the direction from which a chunk is approached.

A one-chunk halo resolves cross-boundary collisions, while only the target
chunk's owned records are emitted. Near meshes, impostors and clusters therefore
share the same authoritative source positions.

Terrain invalidation is chunk-local. Tile changes dirty the owning chunk, shared
height vertices dirty every affected neighbor, and reset/load operations advance
a global epoch. Unrelated distant edits do not rebuild the active vegetation
window.

## Tree impostor assets

The canonical production path is offline generation:

```bash
npm run bake:impostors
npm run validate:assets
```

The baker starts the application in a headless Chromium-family browser, renders
each tree prototype into an 8 × 2 atlas with dilated per-tile gutters, exports albedo/coverage and view-space
normal textures, and writes:

```text
public/assets/impostors/trees/manifest.json
public/assets/impostors/trees/prototype-<index>-albedo.png
public/assets/impostors/trees/prototype-<index>-normal.png
```

Atlas lookup happens in the impostor shader. Camera direction is transformed by
the stable per-tree yaw, and the four surrounding azimuth/elevation frames are blended
without rebuilding instance records when the camera rotates. High camera angles
blend toward spherical billboarding so the editor camera does not see edge-on
cards.

When generated files are absent, runtime baking is an explicit development
fallback. It does not block initial mesh rendering. Opening the application with
`?bakeImpostors=1` forces a fresh runtime bake even when an existing manifest is
present, which keeps the offline command reproducible after source-art changes.

## GPU culling

On the WebGPU backend, each impostor prototype owns:

- source transform and parameter storage buffers;
- a compacted visible-index storage buffer;
- six uploaded frustum planes;
- a five-word indirect draw buffer.

A reset compute pass clears the indirect instance count. A culling pass tests
each bounding sphere against the frustum, atomically reserves an output slot for
visible instances, and writes the source index into the compacted buffer. The
render then uses that indirect instance count. No visibility readback is used.

WebGL or unsupported WebGPU paths use CPU frustum culling with the same records
and material. Performance counters distinguish source records from submitted
instances and identify the active culling mode.

## Grass and flowers

Grass now stores clump transforms instead of one transform per blade. Multiple
blade meshes are authored into the shared clump geometry, reducing instance
attribute count and update traffic. Rock and placed-boulder interaction is
rasterized into a small per-chunk RGBA influence texture containing bend
direction and flattening strength. The grass shader samples that texture, so
three trample floats are no longer duplicated for every instance.

Grass builds are resumable and process a configured number of cells per slice.
The previous same-chunk geometry remains visible while a replacement completes;
stale geometry is hidden when a terrain slot changes ownership. Heavy resources
are released after a configurable number of inactive frames.

Flower variants are combined into side-by-side texture atlases and emitted by
one slot per terrain chunk. The variant is an instance parameter, reducing the
previous two draws per slot to one.

## Configuration

The active settings live in `editor.config.yaml` under:

```text
stylizedSurface.grass
stylizedSurface.flowers
stylizedSurface.groundCover
stylizedSurface.lod.tree
stylizedSurface.lod.rock
stylizedSurface.lod.impostor
stylizedSurface.lod.gpuCulling
stylizedSurface.streaming
```

Configuration validation enforces ordered radii, descending pixel thresholds,
valid transition durations, atlas dimensions, clump sizes and influence-texture
sizes.

## Verification

Run the complete local gate:

```bash
npm run verify
```

Then capture the movement battery:

```bash
npm run qa:perf -- --qa move --warmup 2 --duration 12 --speed run
npm run qa:perf -- --qa strafe --warmup 2 --duration 12 --speed run
npm run qa:perf -- --qa diagonal --warmup 2 --duration 12 --speed run
npm run qa:perf -- --qa chunk-cross --warmup 2 --duration 20 --speed run
npm run qa:perf:parse
```

Inspect these gauges in the report:

```text
treeManifestBuilds
treeManifestQueueDepth
treeNearInstances
treeProxyInstances
treeImpostorInstances
treeCanopyClusters
treeImpostorRecords.cpu
treeImpostorRecords.gpu
treeImpostorSubmitted.cpu
treeImpostorSubmitted.gpu
treeImpostorAtlasBytes
grassLastChunkClumps
grassLastChunkEffectiveBlades
grassInstanceAttributeBytes
grassInfluenceTextureUploads
grassBuildSlices
grassResourceReleases
flowerLastChunkInstances
rendererDrawCalls
rendererTriangles
rendererGeometries
rendererTextures
```

Acceptance requires stable manifests across approach directions, no unrelated
world-edit rebuilds, no stale slot geometry, bounded near-mesh counts, successful
asset validation, zero WebGPU validation errors and no chunk-cross regression in
frame-time percentiles.
