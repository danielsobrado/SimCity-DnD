import * as THREE from 'three/webgpu';
import {
  clamp,
  float,
  fract,
  max,
  min,
  mix,
  oneMinus,
  positionLocal,
  pow,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { stylizedDirtMask, stylizedFbm, stylizedPatchMask } from './stylized/StylizedNoiseNodes.js';

const CELL_GRID_COLOR = vec3(0.035, 0.045, 0.038);
const HEIGHT_SHADE_SCALE = 0.018;
const MINIMUM_HEIGHT_SHADE = 0.72;
const MAXIMUM_HEIGHT_SHADE = 1.22;

function colorNode(value) {
  const color = new THREE.Color(value);
  return vec3(color.r, color.g, color.b);
}

function gridLine(coordinate, width) {
  const wrapped = fract(coordinate);
  const edge = min(wrapped, vec2(1).sub(wrapped));
  return oneMinus(smoothstep(0, width, min(edge.x, edge.y)));
}

export function createTerrainMaterial({
  tileTexture,
  heightTexture,
  surfaceMaskTexture,
  chunkCenter,
  chunkWorldSize,
  width,
  height,
  stylizedConfig,
}) {
  const terrainUv = uv();
  const mapSize = vec2(width, height);
  const tileColor = texture(tileTexture, terrainUv).rgb;
  const terrainHeight = texture(heightTexture, terrainUv).r;
  const surface = texture(surfaceMaskTexture, terrainUv);
  const cellGrid = gridLine(terrainUv.mul(mapSize), 0.045);
  const heightShade = clamp(
    terrainHeight.mul(HEIGHT_SHADE_SCALE).add(1),
    MINIMUM_HEIGHT_SHADE,
    MAXIMUM_HEIGHT_SHADE,
  );

  const worldXZ = vec2(
    chunkCenter.x.add(terrainUv.x.sub(0.5).mul(chunkWorldSize)),
    chunkCenter.y.add(float(0.5).sub(terrainUv.y).mul(chunkWorldSize)),
  );
  const dirtSettings = {
    scale: float(stylizedConfig.dirt.scale),
    coverage: float(stylizedConfig.dirt.coverage),
    softness: float(stylizedConfig.dirt.softness),
    warp: float(stylizedConfig.dirt.warp),
  };
  const patchSettings = {
    scale: float(stylizedConfig.patch.scale),
    bias: float(stylizedConfig.patch.bias),
  };
  const grassCoverage = surface.g;
  const pathMask = surface.r;
  const proceduralDirt = stylizedDirtMask(worldXZ, dirtSettings).mul(grassCoverage);
  const dirt = max(pathMask, proceduralDirt);
  const patch = stylizedPatchMask(worldXZ, patchSettings);
  const grassTint = mix(
    colorNode(stylizedConfig.color.bottom),
    mix(
      colorNode(stylizedConfig.patch.lush),
      colorNode(stylizedConfig.patch.dry),
      patch,
    ),
    stylizedConfig.patch.strength,
  ).mul(stylizedConfig.color.brightness);
  let groundColor = mix(tileColor, grassTint, grassCoverage);
  groundColor = mix(groundColor, colorNode(stylizedConfig.dirt.color), dirt);

  const variation = stylizedFbm(worldXZ.mul(stylizedConfig.ground.variationScale)).sub(0.5);
  const grain = stylizedFbm(worldXZ.mul(stylizedConfig.ground.grainScale)).sub(0.5);
  const variationColor = colorNode(stylizedConfig.ground.variationColor);
  groundColor = groundColor.add(
    variationColor.sub(groundColor)
      .mul(variation)
      .mul(stylizedConfig.ground.variationStrength)
      .mul(dirt),
  );
  groundColor = groundColor.add(
    variationColor.sub(groundColor)
      .mul(grain)
      .mul(stylizedConfig.ground.grainStrength)
      .mul(dirt),
  );
  groundColor = max(groundColor, vec3(0));

  const material = new THREE.MeshBasicNodeMaterial();
  const cellShaded = mix(groundColor, CELL_GRID_COLOR, cellGrid.mul(0.08));
  material.colorNode = cellShaded.mul(heightShade);
  material.positionNode = positionLocal.add(vec3(0, 0, terrainHeight));
  return material;
}
