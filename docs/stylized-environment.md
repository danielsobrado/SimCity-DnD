# Stylized WebGPU environment

The environment layer adapts the visual contracts from `cortiz2894/stylized-components`
to the SimCity DnD streamed Three.js world.

## Asset paths

The integration expects these files under `public`:

```text
public/assets/grass-scene.glb
public/assets/textures/bark/bark_color.png
public/assets/textures/bark/bark_AO.png
public/assets/textures/bark/bark_height.png
public/assets/textures/flower/flowers.png
public/assets/textures/flower/flowersRGB.png
public/assets/textures/flower/flowersGradient.png
public/assets/textures/flower3/flowers.png
public/assets/textures/flower3/flowersRGB.png
public/assets/textures/flower3/flowersGradient.png
```

The GLB material-name contract is configured in `editor.config.yaml`:

```yaml
stylizedSurface:
  assets:
    rockMaterial: RocksStylized_M
    trunkMaterial: Material.011
    leafMaterial: 2237f4d60830642a24d65276e7abe1e6
```

## Rendering architecture

- Ground color, dirt, lush/dry variation, path blending and cloud animation use TSL.
- Grass blades are deterministic streamed instances. Wind, blade shortening, color,
  rock trampling, and sun-based translucency run in the WebGPU material.
- Flowers are streamed crossed billboards using the source alpha masks, RGB palette
  zones and base-to-tip gradients.
- Rocks and pine-tree parts are extracted from the source GLB for streaming:
  - **Rocks:** scale-only bake (demo placement tumble is stripped) + y=0 ground pivot,
    unique meshes only. Instances use Y-spin only.
  - **Pines:** full world-matrix bake (keeps Sketchfab −90°/scale), reject non-upright
    AABBs, shared ground pivot per prototype.
- Pine foliage preserves the source alpha silhouette, applies the source color
  treatment and uses the same wind clock as the grass.
- Water tiles get a cel-shaded Voronoi overlay (F1 − SmoothF1) with world-anchored
  flow, matching the upstream WaterFloor look without the demo-only ripple/PDE stack.
- The sky is a camera-following inverted dome with the source day palette, sun glow,
  clouds, fog and lighting.
- Terrain, grass and flowers use Lambert node materials under the shared day rig.
- Generated render data is not read back from the GPU.

## Streaming limits

Grass, rocks, flowers and trees have independent resident radii. Tree/rock instances
are stored in canonical world space and offset by a group for floating-origin snaps,
so origin shifts do not rebuild instance buffers. Animation is uniform-driven and does
not rebuild instances every frame.

## Configuration

All style and density values live under `stylizedSurface` in `editor.config.yaml`.

Grass density vs upstream: the GrassField demo uses **300 blades / world-unit²** on a
tiny patch. Here `bladesPerCell` is per terrain cell (`tileSize × tileSize` area), so
areal density is `bladesPerCell / tileSize²` (default ≈ 12/u²). Blade width/length
defaults match the upstream Spring preset so the field reads dense without the demo’s
full instance count.

Reduce these first when tuning performance:

1. `grass.bladesPerCell`
2. `flowers.perChunk`
3. `trees.perChunk`
4. `rocks.perChunk`
5. individual resident radii
6. `sky.shadows` or `sky.shadowMapSize`

## Attribution

See `THIRD_PARTY_NOTICES.md` for the upstream MIT notice.
