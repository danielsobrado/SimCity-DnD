import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { normalizeProceduralRecipe } from './ProceduralAssetStore.js';

const PALETTES = Object.freeze({
  granite: Object.freeze({
    base: [116, 121, 124],
    mortar: [82, 84, 82],
    color: '#858b8e',
  }),
  limestone: Object.freeze({
    base: [181, 164, 127],
    mortar: [119, 110, 92],
    color: '#b9a983',
  }),
  sandstone: Object.freeze({
    base: [170, 105, 68],
    mortar: [103, 72, 58],
    color: '#b7774f',
  }),
});

function mixSeed(seed, value) {
  let hash = (seed ^ Math.imul(value + 1, 0x9e3779b1)) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function createAlbedoTexture(style, seed) {
  const size = 128;
  const palette = PALETTES[style];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const coarseX = Math.floor(x / 16);
      const coarseY = Math.floor(y / 12);
      const coarse = (mixSeed(seed, coarseX + coarseY * 17) & 255) / 255;
      const grain = (mixSeed(seed + y * size, x) & 255) / 255;
      const joint = x % 32 < 2 || y % 16 < 2 || (y % 32 >= 16 && (x + 16) % 32 < 2);
      const source = joint ? palette.mortar : palette.base;
      const variation = joint ? -8 : (coarse - 0.5) * 28 + (grain - 0.5) * 10;
      data[index] = Math.max(0, Math.min(255, source[0] + variation));
      data[index + 1] = Math.max(0, Math.min(255, source[1] + variation));
      data[index + 2] = Math.max(0, Math.min(255, source[2] + variation));
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.needsUpdate = true;
  return texture;
}

function createStoneMaterial(recipe) {
  const palette = PALETTES[recipe.style];
  const material = new THREE.MeshStandardMaterial({
    color: recipe.albedo ? '#ffffff' : palette.color,
    roughness: 0.88,
    metalness: 0,
  });
  if (recipe.albedo) {
    material.map = createAlbedoTexture(recipe.style, recipe.seed);
  }
  return material;
}

function createWoodMaterial() {
  return new THREE.MeshStandardMaterial({
    color: '#543521',
    roughness: 0.92,
    metalness: 0,
  });
}

function transformedRoundedBox(width, height, depth, x, y, z, yaw = 0, detail = 2) {
  const radius = Math.min(width, height, depth) * 0.055;
  const shape = new THREE.Shape();
  const halfWidth = Math.max(0.02, width / 2 - radius);
  const halfHeight = Math.max(0.02, height / 2 - radius);
  shape.moveTo(-halfWidth, -halfHeight);
  shape.lineTo(halfWidth, -halfHeight);
  shape.lineTo(halfWidth, halfHeight);
  shape.lineTo(-halfWidth, halfHeight);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, depth - radius * 2),
    steps: 1,
    bevelEnabled: true,
    bevelThickness: radius,
    bevelSize: radius,
    bevelSegments: detail >= 3 ? 2 : 1,
  });
  geometry.translate(0, 0, -Math.max(0.02, depth - radius * 2) / 2);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(1, 1, 1),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

function buildWallCourses(recipe, {
  width = recipe.width,
  depth = recipe.depth,
  height = recipe.height,
  centerX = 0,
  centerZ = 0,
  gateWidth = 0,
  gateHeight = 0,
} = {}) {
  const random = createRandom(mixSeed(recipe.seed, Math.round(centerX * 31 + centerZ * 47)));
  const geometries = [];
  const courseHeight = 0.48 - recipe.detail * 0.045;
  const courses = Math.max(2, Math.ceil(height / courseHeight));
  const actualCourseHeight = height / courses;
  const targetStoneWidth = 0.9 - recipe.detail * 0.08;

  for (let course = 0; course < courses; course += 1) {
    const y = (course + 0.5) * actualCourseHeight;
    let cursor = -width / 2;
    let stoneIndex = 0;
    while (cursor < width / 2 - 0.001) {
      const remaining = width / 2 - cursor;
      const desired = targetStoneWidth * (0.72 + random() * 0.56);
      const stoneWidth = Math.min(remaining, Math.max(0.28, desired));
      const stoneCenter = cursor + stoneWidth / 2;
      const insideGate = gateWidth > 0
        && y < gateHeight
        && Math.abs(stoneCenter) < gateWidth / 2 + stoneWidth * 0.38;
      if (!insideGate) {
        const inset = 0.025 + random() * 0.025;
        const jitter = (random() - 0.5) * 0.035;
        geometries.push(transformedRoundedBox(
          Math.max(0.12, stoneWidth - inset),
          Math.max(0.12, actualCourseHeight - inset),
          depth * (0.96 + random() * 0.025),
          centerX + stoneCenter,
          y + jitter,
          centerZ,
          (random() - 0.5) * 0.018,
          recipe.detail,
        ));
      }
      cursor += stoneWidth;
      stoneIndex += 1;
      if (stoneIndex > 256) {
        throw new Error('Workshop stone packing exceeded its safety budget.');
      }
    }
  }
  return geometries;
}

function buildTower(recipe, radius, height, centerX, centerZ, seedOffset = 0) {
  const random = createRandom(mixSeed(recipe.seed, seedOffset));
  const geometries = [];
  const courseHeight = 0.5 - recipe.detail * 0.04;
  const courses = Math.max(3, Math.ceil(height / courseHeight));
  const actualHeight = height / courses;
  const circumference = Math.PI * 2 * radius;
  const blocks = Math.max(10, Math.ceil(circumference / (0.8 - recipe.detail * 0.06)));

  for (let course = 0; course < courses; course += 1) {
    const phase = (course % 2) * Math.PI / blocks;
    for (let block = 0; block < blocks; block += 1) {
      const angle = phase + block / blocks * Math.PI * 2;
      const blockWidth = circumference / blocks * 0.94;
      geometries.push(transformedRoundedBox(
        blockWidth,
        actualHeight * 0.94,
        Math.max(0.45, recipe.depth * 0.6),
        centerX + Math.sin(angle) * radius,
        (course + 0.5) * actualHeight + (random() - 0.5) * 0.018,
        centerZ + Math.cos(angle) * radius,
        angle,
        recipe.detail,
      ));
    }
  }
  return geometries;
}

function createGeometrySets(recipe) {
  if (recipe.archetype === 'wall') {
    return {
      stone: buildWallCourses(recipe),
      wood: [],
    };
  }
  if (recipe.archetype === 'tower') {
    return {
      stone: buildTower(
        recipe,
        Math.max(1, recipe.width / 2 - recipe.depth * 0.2),
        recipe.height,
        0,
        0,
        91,
      ),
      wood: [transformedRoundedBox(
        Math.max(0.8, recipe.width * 0.22),
        Math.min(2.5, recipe.height * 0.4),
        0.16,
        0,
        Math.min(2.5, recipe.height * 0.4) / 2,
        recipe.width / 2,
        0,
        1,
      )],
    };
  }

  const towerRadius = Math.max(1, recipe.depth * 0.7);
  const towerHeight = recipe.height * 1.18;
  return {
    stone: [
      ...buildWallCourses(recipe, {
        gateWidth: Math.min(recipe.width * 0.34, 3.2),
        gateHeight: Math.min(recipe.height * 0.58, 3.4),
      }),
      ...buildTower(recipe, towerRadius, towerHeight, -recipe.width * 0.38, 0, 111),
      ...buildTower(recipe, towerRadius, towerHeight, recipe.width * 0.38, 0, 222),
    ],
    wood: [transformedRoundedBox(
      Math.min(recipe.width * 0.3, 2.8),
      Math.min(recipe.height * 0.54, 3.1),
      0.18,
      0,
      Math.min(recipe.height * 0.54, 3.1) / 2,
      recipe.depth / 2 + 0.05,
      0,
      1,
    )],
  };
}

function createPart(geometries, material, remesh) {
  if (geometries.length === 0) {
    material.dispose();
    return [];
  }
  if (!remesh) {
    return geometries.map((geometry) => ({
      geometry,
      material,
      matrix: new THREE.Matrix4(),
    }));
  }
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) {
    material.dispose();
    throw new Error('The workshop could not merge the generated geometry.');
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return [{ geometry: merged, material, matrix: new THREE.Matrix4() }];
}

export function createProceduralMedievalParts(input) {
  const recipe = normalizeProceduralRecipe(input);
  const sets = createGeometrySets(recipe);
  const stats = Object.freeze({
    stones: sets.stone.length,
    sourceVertices: [...sets.stone, ...sets.wood]
      .reduce((sum, geometry) => sum + geometry.getAttribute('position').count, 0),
    drawParts: recipe.remesh ? (sets.wood.length > 0 ? 2 : 1) : sets.stone.length + sets.wood.length,
  });
  const parts = [
    ...createPart(sets.stone, createStoneMaterial(recipe), recipe.remesh),
    ...createPart(sets.wood, createWoodMaterial(), recipe.remesh),
  ];
  Object.defineProperty(parts, 'stats', { value: stats, enumerable: false });
  return Object.freeze(parts);
}

export function getProceduralRecipeStats(input) {
  const recipe = normalizeProceduralRecipe(input);
  const sets = createGeometrySets(recipe);
  const stones = sets.stone.length;
  const sourceVertices = [...sets.stone, ...sets.wood]
    .reduce((sum, geometry) => sum + geometry.getAttribute('position').count, 0);
  [...sets.stone, ...sets.wood].forEach((geometry) => geometry.dispose());
  return Object.freeze({
    stones,
    sourceVertices,
    drawParts: recipe.remesh ? (sets.wood.length > 0 ? 2 : 1) : stones + sets.wood.length,
  });
}
