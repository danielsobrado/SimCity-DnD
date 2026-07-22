# SimCity DnD

A D&D-inspired city builder built with Three.js, with biome-driven regions, settlement simulation, adventuring parties, monsters, factions, and a streamed campaign-scale world.

## World editor

The current `main` branch contains a large-map terrain and settlement-object editor with:

- A 512 × 512 logical tile map.
- A continuous shared-vertex heightfield without mesh cracks between cells.
- Raise, lower, smooth, and terrain-paint brushes.
- GPU texture-driven terrain displacement through TSL with no geometry readbacks.
- A bounded editable GPU marching-cubes chunk using SDF stamps, compute storage, and indirect drawing.
- Plains, forest, water, road, farm, stone, desert, swamp, snow, and corruption terrain.
- Brush sizes from 1 × 1 to 15 × 15.
- Cottage, farmstead, inn, wizard tower, keep, wall, tree, and boulder placement.
- Slope-aware elevated placement with conforming props and terrace foundations.
- Rotated footprints, overlap checks, terrain restrictions, selection, movement, and deletion.
- Instanced GLB rendering with procedural fallback models.
- Orthographic pan, zoom, and rotation controls.
- Undo and redo history across terrain, heights, objects, and voxel stamps.
- Browser save/load and JSON import/export, including sparse heightfield and voxel edit data.
- A clickable minimap and visible 32 × 32 cell chunk boundaries.
- WebGPURenderer by default, with its built-in WebGL 2 fallback.

Run it with:

```bash
npm install
npm run generate:assets
npm run verify
npm run dev
```

Three.js is pinned to r185.1. Renderer, terrain limits, editor dimensions, brush settings, and the voxel prototype are kept in `editor.config.yaml`. Object placement, foundation, and asset metadata are kept in `config/objects.yaml`.

## Terrain elevation

The editor stores one height at every logical cell corner, so neighboring cells use the same vertices and cannot split apart. JavaScript keeps the authoritative editable heightfield for saves and undo. Rendering samples that array as a GPU float texture from a TSL `positionNode`; normal editing does not read terrain geometry back from the GPU.

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

## Editable GPU marching cubes

The editor includes one bounded marching-cubes chunk beside the heightfield. The scalar field and generated surface remain GPU-resident:

```text
procedural scalar field
  → apply sparse add and subtract SDF stamps
  → apply local density smoothing stamps
  → classify every cell and count its triangles
  → atomically allocate output vertex ranges
  → interpolate smooth vertices and density-gradient normals
  → GPU-written indirect vertex count
  → one indirect surface draw
```

The CPU stores only a compact ordered stamp list for editing, undo/redo, and saves. Each stamp contains an operation, center, radius, strength, and blend distance. Edits upload that small list to storage buffers and regenerate the density grid and surface in WebGPU compute passes. Generated density, positions, normals, triangle counts, and draw counts are never read back to JavaScript.

The sidebar provides Add, Dig, and Smooth operations. `Use cursor` copies the current map cursor into voxel-local X/Z coordinates; Y remains explicitly controlled so caves and raised volumes can be edited without a geometry readback.

World document version 4 persists `voxelStamps` sparsely. Versions 1–3 still load with an empty voxel edit layer. Invalid imported stamps restore the previous world transactionally.

This remains one proof chunk. Multiple resident chunks, border ownership, dirty-region compute, LOD transitions, and heightfield-to-voxel stitching remain separate phases.

## Renderer

The editor uses `WebGPURenderer` and TSL terrain materials. WebGPU is selected when supported; Three.js falls back to its WebGL 2 backend otherwise. Set `renderer.forceWebGL` in `editor.config.yaml` only for compatibility testing. Voxel surface generation is disabled on the WebGL fallback while the heightfield editor continues to work.

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
