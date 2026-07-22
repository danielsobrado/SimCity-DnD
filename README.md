# SimCity DnD

A D&D-inspired city builder built with Three.js, with biome-driven regions, settlement simulation, adventuring parties, monsters, factions, and a streamed campaign-scale world.

## World editor

The current `main` branch contains a large-map terrain and settlement-object editor with:

- A 512 × 512 logical tile map.
- A continuous shared-vertex heightfield without mesh cracks between cells.
- Raise, lower, smooth, and terrain-paint brushes.
- GPU texture-driven terrain displacement through TSL with no geometry readbacks.
- Camera-driven GPU marching-cubes chunk streaming through a fixed reusable slot pool.
- Selectable Edit / Orbit and first-person Player modes.
- Plains, forest, water, road, farm, stone, desert, swamp, snow, and corruption terrain.
- Brush sizes from 1 × 1 to 15 × 15.
- Cottage, farmstead, inn, wizard tower, keep, wall, tree, and boulder placement.
- Slope-aware elevated placement with conforming props and terrace foundations.
- Rotated footprints, overlap checks, terrain restrictions, selection, movement, and deletion.
- Instanced GLB rendering with procedural fallback models.
- Undo and redo history across terrain, heights, objects, and voxel stamps.
- Browser save/load and JSON import/export, including sparse heightfield and voxel edit data.
- A clickable minimap, visible terrain chunk boundaries, and rolling average FPS display.
- WebGPURenderer by default, with its built-in WebGL 2 fallback.

Run it with:

```bash
npm install
npm run generate:assets
npm run verify
npm run dev
```

Three.js is pinned to r185.1. Renderer, player movement, terrain limits, editor dimensions, brush settings, and voxel streaming are kept in `editor.config.yaml`. Object placement, foundation, and asset metadata are kept in `config/objects.yaml`.

## Camera modes

The top-left viewport controls switch between two camera modes.

### Edit / Orbit

- Middle mouse or Space + drag pans the map.
- Right mouse drag rotates the view.
- Mouse wheel zooms.
- Terrain, object, and selection tools remain active.

### Player

- Click the viewport to capture the mouse.
- Move with `W`, `A`, `S`, and `D`.
- Hold `Shift` to run.
- Press `Space` to jump.
- Move the mouse to look around.
- Press `Esc` to release the mouse.
- Select Edit / Orbit to return to editing.

Player movement uses gravity, map bounds, and the authoritative CPU heightfield for ground contact. It does not read the generated marching-cubes surface back from the GPU. Collision with GPU-only caves, overhangs, and voxel additions is a separate future phase.

## Terrain elevation

The editor stores one height at every logical cell corner, so neighboring cells use the same vertices and cannot split apart. JavaScript keeps the authoritative editable heightfield for saves, player grounding, and undo. Rendering samples that array as a GPU float texture from a TSL `positionNode`; normal editing does not read terrain geometry back from the GPU.

Object placement samples every shared vertex under the footprint:

- Buildings stay upright at the highest supported footprint elevation.
- Uneven building sites receive instanced retaining foundations.
- Trees and rocks use the sampled center height.
- Configured props can align to the terrain normal.
- Placement is rejected when slope or foundation depth exceeds the object limits.
- Existing objects protect the shared vertices below their footprints from sculpting.

Terrain shortcuts:

- `P`: paint tile materials.
- `U`: raise terrain.
- `J`: lower terrain.
- `K`: smooth terrain.
- `[` and `]`: change brush size.

## Camera-driven GPU marching cubes

The map-scale voxel coordinate space is divided into `24 × 16 × 24` marching-cubes chunks. Only nine chunks are resident by default. These chunks occupy a fixed GPU slot pool centered on the active Edit or Player camera.

When the camera enters another voxel chunk:

1. Chunks still required by the new resident set keep their existing slots.
2. Empty slots are assigned first.
3. Remaining slots are evicted deterministically by distance, last use, and slot index.
4. Newly assigned chunks receive new absolute-coordinate offsets through TSL uniforms.
5. Existing density, geometry, normal, classification, and indirect-draw buffers are reused.
6. Only newly assigned chunks and resident chunks affected by changed stamps regenerate.

Each slot includes a one-sample GPU halo. The halo supplies neighboring density values for smoothing and gradient normals, so shared borders use matching positions and lighting inputs rather than clamped edge derivatives.

```text
active camera position
  → select nearest chunk coordinates
  → retain matching GPU slots
  → deterministically reassign stale slots
  → filter sparse stamps for each assigned chunk
  → generate local density plus one-sample halo
  → classify and emit marching-cubes geometry
  → one indirect draw per resident slot
```

The CPU stores only camera position, slot ownership, and the compact ordered stamp list. Generated density, positions, normals, triangle counts, and draw counts are never read back to JavaScript.

The sidebar provides Add, Dig, and Smooth operations. `Use cursor` copies the map cursor into global voxel-world X/Z coordinates; Y remains explicitly controlled for caves and raised volumes.

World document version 5 stores voxel-world dimensions with the sparse stamp list. Version 4 single-chunk saves are centered into the current map-scale volume during loading. Versions 1–3 still load with an empty voxel edit layer. Invalid imports restore the previous world transactionally.

Dirty-region dispatch inside one chunk, voxel LOD transitions, heightfield-to-voxel visual stitching, and GPU-surface player collision remain separate phases.

## Renderer

The editor uses `WebGPURenderer` and TSL terrain materials. WebGPU is selected when supported; Three.js falls back to its WebGL 2 backend otherwise. Set `renderer.forceWebGL` in `editor.config.yaml` only for compatibility testing. Voxel surface generation is disabled on the WebGL fallback while the heightfield editor and Player mode continue to work.

## GLB assets

Production visuals are loaded from the shared `public/assets/models/settlement-core.glb` asset pack. The editor starts with procedural fallback geometry, loads each GLB asynchronously, validates its footprint and ground pivot, then swaps it into the existing instanced renderer.

Regenerate the complete model catalog with:

```bash
npm run generate:assets
```

Then validate it with:

```bash
npm run validate:assets
```

The asset generator uses only Python's standard library. See `docs/asset-pipeline.md` for the authoring contract and failure behavior.

## Starter pack

The original starter archive remains at:

`starter/simcity-dnd-starter-pack.zip`

It contains the earlier vertical slice, transparent starter icons, architecture notes, an asset style guide, and a phased roadmap.

## Scope principle

Build one deep, playable settlement in one biome before implementing the huge streamed world. The first acceptance target is a 30-minute loop with placement, resources, a D&D-style threat, and save/load.
