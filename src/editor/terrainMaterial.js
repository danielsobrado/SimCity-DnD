import * as THREE from 'three/webgpu';
import {
  clamp,
  fract,
  min,
  mix,
  oneMinus,
  positionLocal,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

const CELL_GRID_COLOR = vec3(0.035, 0.045, 0.038);
const CHUNK_GRID_COLOR = vec3(0.84, 0.71, 0.36);
const HEIGHT_SHADE_SCALE = 0.018;
const MINIMUM_HEIGHT_SHADE = 0.72;
const MAXIMUM_HEIGHT_SHADE = 1.22;

function gridLine(coordinate, width) {
  const wrapped = fract(coordinate);
  const edge = min(wrapped, vec2(1).sub(wrapped));
  return oneMinus(smoothstep(0, width, min(edge.x, edge.y)));
}

export function createTerrainMaterial({
  tileTexture,
  heightTexture,
  width,
  height,
  chunkSize,
}) {
  const terrainUv = uv();
  const mapSize = vec2(width, height);
  const tileColor = texture(tileTexture, terrainUv).rgb;
  const terrainHeight = texture(heightTexture, terrainUv).r;
  const cellGrid = gridLine(terrainUv.mul(mapSize), 0.045);
  const chunkGrid = gridLine(terrainUv.mul(mapSize.div(chunkSize)), 0.018);
  const heightShade = clamp(
    terrainHeight.mul(HEIGHT_SHADE_SCALE).add(1),
    MINIMUM_HEIGHT_SHADE,
    MAXIMUM_HEIGHT_SHADE,
  );

  const material = new THREE.MeshBasicNodeMaterial();
  const cellShaded = mix(tileColor, CELL_GRID_COLOR, cellGrid.mul(0.22));
  material.colorNode = mix(cellShaded, CHUNK_GRID_COLOR, chunkGrid.mul(0.38)).mul(heightShade);
  material.positionNode = positionLocal.add(vec3(0, 0, terrainHeight));
  return material;
}
