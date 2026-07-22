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
  and rock trampling run in the WebGPU material.
- Flowers are streamed crossed billboards using the source alpha masks, RGB palette
  zones and base-to-tip gradients.
- Rocks and pine-tree parts are extracted from the source GLB and rendered through
  bounded `InstancedMesh` groups around the active terrain focus.
- Pine foliage preserves the source alpha silhouette, applies the source color
  treatment and uses the same wind clock as the grass.
- The sky is a camera-following inverted dome with the source day palette, sun glow,
  clouds, fog and lighting.
- Terrain, grass and flowers use Lambert node materials under the shared day rig.
- Generated render data is not read back from the GPU.

## Streaming limits

Grass, rocks, flowers and trees have independent resident radii. Their instances are
rebuilt only when a terrain slot changes, terrain data changes, the floating origin
moves, or relevant object/rock state changes. Animation is uniform-driven and does
not rebuild instances every frame.

## Configuration

All style and density values live under `stylizedSurface` in `editor.config.yaml`.
Reduce these first when tuning performance:

1. `grass.bladesPerCell`
2. `flowers.perChunk`
3. `trees.perChunk`
4. `rocks.perChunk`
5. individual resident radii
6. `sky.shadows` or `sky.shadowMapSize`

## Attribution

See `THIRD_PARTY_NOTICES.md` for the upstream MIT notice.
