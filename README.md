# SimCity DnD

A D&D-inspired city builder built with Three.js, with biome-driven regions, settlement simulation, adventuring parties, monsters, factions, and a streamed campaign-scale world.

## World editor

The current `main` branch contains a large-map terrain editor with:

- A 512 × 512 logical tile map.
- A continuous texture-backed terrain surface without mesh gaps between cells.
- Plains, forest, water, road, farm, stone, desert, swamp, snow, and corruption terrain.
- Brush sizes from 1 × 1 to 15 × 15.
- Orthographic pan, zoom, and rotation controls.
- Undo and redo history.
- Browser save/load and JSON import/export.
- A clickable minimap and visible 32 × 32 cell chunk boundaries.

Run it with:

```bash
npm install
npm test
npm run dev
```

Three.js is pinned to r184. Editor dimensions and brush settings are kept in `editor.config.yaml`.

## Starter pack

The original starter archive remains at:

`starter/simcity-dnd-starter-pack.zip`

It contains the earlier vertical slice, transparent starter icons, architecture notes, an asset style guide, and a phased roadmap.

## Scope principle

Build one deep, playable settlement in one biome before implementing the huge streamed world. The first acceptance target is a 30-minute loop with placement, resources, a D&D-style threat, and save/load.
