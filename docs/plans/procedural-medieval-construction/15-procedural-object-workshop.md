# Procedural Object Workshop

## Status

Implemented as the first vertical slice.

## Product boundary

The workshop is a separate editor option with a bounded 16 × 16 metre preview area. Procedural
generation happens only while authoring or rebuilding an asset. The world receives an ordinary
game-object definition and never runs per-stone construction generation for each placement.

```text
bounded workshop recipe
  -> deterministic masonry
  -> bevelled source stones
  -> merged geometry by material
  -> tileable albedo + shared PBR material
  -> reusable instanced object in the world
```

This complements rather than silently replaces the proposed live wall-path system. Use the
workshop for reusable walls, gatehouses, and towers; use a future live construction tool when
terrain-following paths, gates, damage, navigation, or span editing must remain authoritative.

## Implemented workflow

1. Open **Workshop** from Editor mode.
2. Choose wall, gatehouse, or round tower.
3. Set bounded dimensions, stone family, detail, and deterministic seed.
4. Preview the result under game-compatible PBR lighting.
5. Enable remeshing to consolidate stones into one stone mesh plus optional wood mesh.
6. Enable albedo baking to create a tileable 128 × 128 sRGB stone texture.
7. Bake the asset; it appears in the normal Objects palette and is selected for placement.
8. Save/export the world. The authoritative recipe is persisted and deterministically rebuilt on
   load; generated vertices and textures are not duplicated in every placement.

## Runtime contract

- Every placement uses the existing `ObjectMap`, terrain-foundation validation, selection, undo,
  and instanced `ObjectView` rendering.
- Geometry and materials are shared per baked object definition.
- Remeshed assets use one draw part for stone and one optional draw part for doors.
- No generation path uses `Math.random()`.
- Dimensions are capped to the workshop area and asset count is capped at 32.
- The save contains versioned procedural recipes under `proceduralAssets`.

## Current limits

- Assets live inside the world document rather than an external cross-world library.
- The first generator supports walls, gatehouses, and towers.
- Albedo baking supplies base color; normal, roughness, ambient-occlusion, and LOD texture baking
  remain follow-up work.
- Runtime collision still uses the existing object footprint/foundation contract.
