import * as THREE from 'three/webgpu';
import {
  fract,
  min,
  mix,
  oneMinus,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

const CELL_GRID_COLOR = vec3(0.035, 0.045, 0.038);
const CHUNK_GRID_COLOR = vec3(0.84, 0.71, 0.36);

function gridLine(coordinate, width) {
  const wrapped = fract(coordinate);
  const edge = min(wrapped, vec2(1).sub(wrapped));
  return oneMinus(smoothstep(0, width, min(edge.x, edge.y)));
}

export function createTerrainMaterial({ tileTexture, width, height, chunkSize }) {
  const terrainUv = uv();
  const mapSize = vec2(width, height);
  const tileColor = texture(tileTexture, terrainUv).rgb;
  const cellGrid = gridLine(terrainUv.mul(mapSize), 0.045);
  const chunkGrid = gridLine(terrainUv.mul(mapSize.div(chunkSize)), 0.018);

  const material = new THREE.MeshBasicNodeMaterial();
  const cellShaded = mix(tileColor, CELL_GRID_COLOR, cellGrid.mul(0.22));
  material.colorNode = mix(cellShaded, CHUNK_GRID_COLOR, chunkGrid.mul(0.38));
  return material;
}
