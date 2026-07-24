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
  -> semantic plaster, masonry, openings, and roof silhouette
  -> merged geometry by material
  -> tileable albedo/bump response + shared PBR material
  -> reusable instanced object in the world
```

This complements rather than silently replaces the proposed live wall-path system. Use the
workshop for reusable walls, gatehouses, towers, and tower houses; use a future live construction tool when
terrain-following paths, gates, damage, navigation, or span editing must remain authoritative.

## Implemented workflow

1. Open **Workshop** from Editor mode.
2. Choose wall, gatehouse, round tower, square keep tower, or a composite tower house.
3. Set bounded dimensions, plaster finish, trim stone, roof family, silhouette, tower wing,
   roof height/overhang, detail, age, and deterministic seed.
4. Preview the result in a sunlit garden stage with ACES tone mapping, soft directional shadows,
   sky/ground fill, atmospheric depth, and surrounding scale references.
5. Use the on-canvas gizmo to translate or rotate the preview for inspection. Center and frame
   commands recover the authored view immediately.
6. Enable remeshing to consolidate each material family into one runtime mesh.
7. Enable albedo baking to create tileable 256 × 256 sRGB surface textures.
8. Bake the asset; it appears in the normal Objects palette and is selected for placement.
9. Move placed objects with the existing relocate workflow and rotate them with **R** or the
   selection action.
10. Save/export the world. The authoritative recipe is persisted and deterministically rebuilt on
   load; generated vertices and textures are not duplicated in every placement.

## Runtime contract

- Every placement uses the existing `ObjectMap`, terrain-foundation validation, selection, undo,
  and instanced `ObjectView` rendering.
- Geometry and materials are shared per baked object definition.
- Remeshed assets use one draw part per populated material family, capped at seven parts for the
  current generator.
- Structural generation reserves masonry around real arched openings before it adds jambs,
  voussoirs, recessed panels, doors, mullions, or ironwork.
- Semantic top generation supports coping and battlements, circular and hipped tiled roofs,
  adjustable pitched roofs, stepped gables, machicolation corbels, finials, and flags.
- Tower houses combine a plastered gabled wing, selectable attached tower, stone foundation and
  opening trim, flower boxes, window recesses, ivy, and independently scalable main/tower roofs.
- Stone tint, plaster mottling, wood grain, dampness, raised roof-tile seams, and optional attached
  ivy are deterministic and controlled by the recipe.
- No generation path uses `Math.random()`.
- Dimensions are capped to the workshop area and asset count is capped at 32.
- The save contains versioned procedural recipes under `proceduralAssets`.

## Current limits

- Assets live inside the world document rather than an external cross-world library.
- The first generator supports walls, gatehouses, round towers, square keep towers, and composite
  tower houses.
- Albedo baking supplies stone grain, macro tint, lower-wall dampness, and roof-tile patterning;
  procedural bump response supplies small-scale stone, plaster, wood, and tile relief. Authored
  normal, roughness, ambient-occlusion, and LOD texture baking remain follow-up work.
- Runtime collision still uses the existing object footprint/foundation contract.
