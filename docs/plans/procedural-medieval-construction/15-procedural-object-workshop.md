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
  -> procedural or imported semantic albedo
  -> merged geometry by material
  -> shared PBR material set
  -> reusable instanced object in the world
```

This complements rather than silently replaces the proposed live wall-path system. Use the
workshop for reusable walls, gatehouses, towers, and tower houses; use a future live construction
tool when terrain-following paths, gates, damage, navigation, or span editing must remain
authoritative.

## Implemented workflow

1. Open **Workshop** from Editor mode.
2. Choose wall, gatehouse, round tower, square keep tower, or a composite tower house.
3. Set bounded dimensions, plaster finish, trim stone, roof family, silhouette, tower wing,
   roof height/overhang, detail, age, and deterministic seed.
4. Optionally import PNG, JPEG, or WebP albedo images for **Walls**, **Stone trim**, **Roof**, and
   **Doors & wood**.
5. For each imported image, choose repeat, mirrored repeat, or single-image mapping; adjust repeat,
   rotate in 90-degree steps, tint it, or copy the same source and settings to other areas.
6. Preview the result in a sunlit garden stage with ACES tone mapping, soft directional shadows,
   sky/ground fill, atmospheric depth, and surrounding scale references.
7. Use the on-canvas gizmo to translate or rotate the preview for inspection. Center and frame
   commands recover the authored view immediately.
8. Enable remeshing to consolidate each material family into one runtime mesh.
9. Leave procedural stone albedo enabled to fill masonry and trim without an imported image.
10. Bake the asset; it appears in the normal Objects palette and is selected for placement.
11. Move placed objects with the existing relocate workflow and rotate them with **R** or the
    selection action.
12. Save/export the world. The authoritative recipe and bounded imported images are persisted and
    deterministically rebuilt on load; generated vertices and textures are not duplicated in every
    placement.

## Semantic albedo contract

- Imported files are decoded locally, centre-cropped, and resized to 512 × 512 before persistence.
- Only PNG, JPEG, and WebP data URLs are accepted. SVG and remote URLs are rejected.
- A recipe stores at most four imported sources, with per-source and per-object encoded-size caps.
- Multiple semantic areas may reference one source without duplicating the encoded image.
- Tower-house walls use the wall source while masonry structures intelligently fall back from
  **Stone trim** to **Walls** when no explicit stone source is assigned.
- Imported images replace base colour only. Procedural bump response, roughness, weathering, and
  geometry remain active.
- Version-one workshop records load with empty semantic texture assignments and are saved as
  version two.

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
- Imported textures currently affect albedo only. Authored normal, roughness, ambient-occlusion,
  height, and LOD texture baking remain follow-up work.
- Runtime collision still uses the existing object footprint/foundation contract.
