# SimCity DnD

A D&D-inspired city builder built with Three.js, with biome-driven regions, settlement simulation, adventuring parties, monsters, factions, and a streamed campaign-scale world.

## World editor

The editor now runs on an effectively unbounded logical world rather than one fixed tile array.

- Global signed cell and chunk coordinates.
- `64 × 64` terrain pages with `65 × 65` canonical shared height samples.
- Deterministic procedural terrain outside modified or imported regions.
- Predictive camera and player-driven terrain prefetch.
- Separate load and unload radii to prevent border thrashing.
- A fixed reusable WebGPU terrain-slot pool.
- Bounded CPU chunk caching with deterministic eviction.
- Background chunk generation in a module worker.
- Floating-origin rebasing for long-distance precision.
- Sparse terrain, height, object, campaign, and voxel persistence.
- Portable compressed Azgaar macro-atlas persistence.
- Local-first chunk content with optional URL fallback.
- Dense binary encoding for fully modified or imported chunks.
- IndexedDB browser saves (localStorage is still read as a fallback for older browser saves).
- Native saves use infinite-world document version 6 only.
- Azgaar Fantasy Map Generator Full JSON import into the infinite streamed world.
- Camera-driven GPU marching-cubes voxel streaming with no geometry readbacks.
- Selectable Edit / Orbit and first-person Player modes.
- Terrain painting, raise, lower, and smooth brushes.
- Slope-aware building placement with foundations.
- Instanced GLB settlement rendering with procedural fallbacks.
- Rolling average FPS in the title area.

Run it with:

```bash
npm install
npm run generate:assets
npm run verify
npm run dev
```

Three.js is pinned to r185.1. World generation, streaming, player movement, rendering, terrain limits, and editor settings are in `editor.config.yaml`. Object definitions and asset metadata are in `config/objects.yaml`.

## Infinite terrain streaming

The logical world is divided into fixed pages:

```text
unbounded world cells
  → 64 × 64 terrain chunks
  → 65 × 65 shared height samples
  → bounded CPU cache
  → fixed GPU terrain slots
```

Only pages around the active Edit or Player camera are resident. The streamer also predicts the camera position from its velocity and starts loading forward pages before the current chunk border is crossed.

The default terrain settings are:

```yaml
world:
  chunkSize: 64
  loadRadius: 2
  unloadRadius: 3
  prefetchSeconds: 1.5
  maxResidentChunks: 49
  maxCpuChunks: 81
  floatingOriginThreshold: 4096
```

Clean pages regenerate from the world seed and canonical global coordinates. Only changed cells, changed heights, placed objects, campaign metadata, and voxel stamps are saved.

Neighboring chunks cannot split at their boundaries because both sides request the same global height samples. Shared edge edits update all resident pages that reference those samples.

## Save format

Native document version 6 stores:

- Generator seed and version.
- Optional Azgaar macro base terrain, physical scale, rectangular bounds, and rivers.
- Chunk and tile dimensions.
- Modified terrain chunks only; clean generated chunks are reproducible and omitted.
- Placed objects.
- Sparse voxel stamps.
- Imported campaign metadata.

Sparse chunks use index/value pairs. Dense imported or heavily modified chunks use base64 little-endian binary payloads with explicit empty sentinels.

Browser saves use IndexedDB. Native documents must be version 6 (infinite world). Older dense map formats (versions 1–5) are no longer loadable — re-export from a current session or import Azgaar Full JSON.

## Azgaar import

Use **Import** and select an Azgaar **Full JSON** export. The import dialog shows
the source scale, automatically preserves the source aspect ratio, and allows
the physical world width to be overridden.

The conversion runs in a worker and writes a **version 6 infinite-world
document** containing a compressed macro atlas. The default atlas long edge is
`import.azgaarAtlasLongEdge: 2000`; the shorter edge follows the Azgaar map
aspect ratio. Atlas pixels describe continent-scale geography rather than
literal playable cells.

The chunk worker converts canonical world coordinates into atlas coordinates
and generates detailed `64 × 64` terrain pages only as the camera or player
approaches them. Generated clean pages are evicted and regenerated
deterministically. Only edits remain as sparse overrides, so memory and save
growth are not proportional to the physical world area.

The macro source imports:

- Interpolated elevation with deterministic local relief.
- Land, ocean, forest, desert, wetland, snow, and rocky terrain.
- River centerlines used to generate local water channels.
- Feature identifiers for future overlays and simulation.
- Source map information.
- States and provinces.
- Cultures and religions.
- Burgs.
- Rivers and routes.
- Markers, zones, and notes.

Political, settlement, route, marker, and note records are preserved as
campaign metadata. Labels, heraldry, and Azgaar visual styling are not yet
rendered as native overlays.

The imported rectangle is centered on the world origin. Terrain beyond its
bounds transitions into deep ocean over
`import.azgaarOceanTransitionKilometers`. Direct Azgaar `.map` files are not
supported; export Full JSON from Azgaar first.

## World content providers

Terrain is deterministic and does not need to be downloaded or cached on disk.
Authored settlements, encounters, and other chunk content use a local-first
provider chain:

1. IndexedDB content for offline use.
2. An optional URL provider configured with `world.contentBaseUrl`.
3. Deterministic generation when no authored content exists.

Remote results are cached locally. Network failures fall back to local or empty
content without affecting terrain streaming.

## Camera modes

### Edit / Orbit

- Middle mouse or Space + drag pans.
- Right mouse drag rotates.
- Mouse wheel zooms.
- Terrain, object, selection, and voxel tools remain active.

### Player

- Click the viewport to capture the mouse.
- `W`, `A`, `S`, `D` move.
- `Shift` runs.
- `Space` jumps.
- Mouse movement looks around.
- `Esc` releases the mouse.
- Select **Edit / Orbit** to return to editing.

Player grounding uses the authoritative CPU heightfield and therefore remains readback-free. GPU-only caves, overhangs, and added voxel surfaces do not yet provide player collision.

## GPU marching cubes

The voxel terrain uses a fixed nine-slot WebGPU pool by default. Each resident chunk retains its density, smoothed-density, classification, vertex, normal, and indirect-draw buffers.

```text
sparse SDF stamps
  → GPU density generation
  → GPU smoothing
  → marching-cubes classification
  → GPU vertex and normal emission
  → indirect rendering
```

Generated density, triangle counts, positions, normals, and draw commands are never downloaded to JavaScript during normal operation.

## GLB assets

Production visuals are loaded from `public/assets/models/settlement-core.glb`. Procedural models remain visible until each configured GLB node passes runtime validation.

```bash
npm run generate:assets
npm run validate:assets
```

See `docs/asset-pipeline.md` for the authoring contract.

## Current limits

- Object rendering is globally stored and is not yet independently simulation-LOD streamed.
- Voxel stamps are sparse and globally capped by configuration.
- Azgaar political borders, labels, and routes are metadata rather than native rendered overlays.
- Player collision does not query the GPU marching-cubes surface.
- Full visual runtime verification still requires a physical WebGPU browser.

These are explicit later phases, not hidden fallbacks or readback paths.
