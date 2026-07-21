# SimCity DnD

A D&D-inspired city builder built with Three.js, with biome-driven regions, settlement simulation, adventuring parties, monsters, factions, and a streamed campaign-scale world.

## World editor

The current `main` branch contains a large-map terrain and settlement-object editor with:

- A 512 × 512 logical tile map.
- A continuous shared-vertex heightfield without mesh cracks between cells.
- Raise, lower, smooth, and terrain-paint brushes.
- GPU texture-driven terrain displacement through TSL with no geometry readbacks.
- A bounded GPU-resident voxel-density prototype using compute storage and indirect drawing.
- Plains, forest, water, road, farm, stone, desert, swamp, snow, and corruption terrain.
- Brush sizes from 1 × 1 to 15 × 15.
- Cottage, farmstead, inn, wizard tower, keep, wall, tree, and boulder placement.
- Slope-aware elevated placement with conforming props and terrace foundations.
- Rotated footprints, overlap checks, terrain restrictions, selection, movement, and deletion.
- Instanced GLB rendering with procedural fallback models.
- Orthographic pan, zoom, and rotation controls.
- Undo and redo history across terrain, heights, and objects.
- Browser save/load and JSON import/export, including sparse heightfield data.
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

## GPU voxel prototype

The editor includes one bounded voxel chunk beside the heightfield. A WebGPU compute pass evaluates a deterministic procedural density function for every cell. Solid cells are compacted into a GPU storage buffer with an atomic counter. The same counter becomes the instance count in an indexed indirect draw command.

The normal path is:

```text
procedural density compute
  → compacted GPU position storage
  → GPU-written indirect instance count
  → one indirect instanced cube draw
```

No generated voxel positions, geometry, or counts are read back to JavaScript. The sidebar toggle can show or hide the chunk. When Three.js is using its WebGL fallback, the prototype is disabled and the existing heightfield editor continues to work.

This phase is not marching cubes. It proves GPU residency, density evaluation, compaction, and indirect rendering first. Marching-cubes surface extraction, editable voxel stamps, multiple resident chunks, and heightfield-to-voxel transition stitching remain separate phases.

## Renderer

The editor uses `WebGPURenderer` and TSL terrain materials. WebGPU is selected when supported; Three.js falls back to its WebGL 2 backend otherwise. Set `renderer.forceWebGL` in `editor.config.yaml` only for compatibility testing.

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
