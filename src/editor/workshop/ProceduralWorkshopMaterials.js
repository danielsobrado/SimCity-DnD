import * as THREE from 'three/webgpu';
import { mixSeed } from './ProceduralRandom.js';

export const STONE_PALETTES = Object.freeze({
  granite: Object.freeze({ base: [126, 132, 136], warm: [151, 143, 129], color: '#858b8e' }),
  limestone: Object.freeze({ base: [184, 169, 137], warm: [207, 188, 145], color: '#b9a983' }),
  sandstone: Object.freeze({ base: [174, 112, 74], warm: [205, 145, 89], color: '#b7774f' }),
});

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function createTexture(size, pixel) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const color = pixel(x, y);
      data[index] = clampByte(color[0]);
      data[index + 1] = clampByte(color[1]);
      data[index + 2] = clampByte(color[2]);
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function stoneTexture(recipe) {
  const palette = STONE_PALETTES[recipe.style];
  return createTexture(128, (x, y) => {
    const broad = (mixSeed(recipe.seed + Math.floor(y / 12), Math.floor(x / 12)) & 255) / 255;
    const grain = (mixSeed(recipe.seed + y * 131, x * 17) & 255) / 255;
    const damp = recipe.weathering * Math.max(0, 1 - y / 42);
    const value = (broad - 0.5) * 13 + (grain - 0.5) * 7 - damp * 16;
    return palette.base.map((channel, index) => (
      channel + value + (index === 1 ? damp * 4 : 0)
    ));
  });
}

function roofTexture(topStyle, seed) {
  const slate = topStyle === 'slate';
  const base = slate ? [73, 83, 99] : [167, 79, 48];
  return createTexture(128, (x, y) => {
    const row = Math.floor(y / 16);
    const tileX = (x + (row % 2) * 10) % 24;
    const seam = tileX < 2 || y % 16 < 2;
    const noise = ((mixSeed(seed + row, Math.floor(x / 24)) & 255) / 255 - 0.5) * 18;
    return base.map((channel) => channel + noise - (seam ? 24 : 0));
  });
}

export function applyStoneColor(geometry, recipe, stableIndex, heightRatio = 0.5) {
  const palette = STONE_PALETTES[recipe.style];
  const tint = (mixSeed(recipe.seed, stableIndex) & 255) / 255;
  const weather = recipe.weathering * (1 - heightRatio) * 0.14;
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let index = 0; index < colors.length; index += 3) {
    for (let channel = 0; channel < 3; channel += 1) {
      const base = palette.base[channel] / 255;
      const warm = palette.warm[channel] / 255;
      colors[index + channel] = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(base, warm, tint * 0.24) * (0.9 + tint * 0.16) - weather,
        0,
        1,
      );
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function createWorkshopMaterials(recipe) {
  const stone = new THREE.MeshStandardMaterial({
    color: recipe.albedo ? '#ffffff' : STONE_PALETTES[recipe.style].color,
    map: recipe.albedo ? stoneTexture(recipe) : null,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
  });
  const roof = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: roofTexture(recipe.topStyle, recipe.seed),
    roughness: 0.84,
    metalness: 0,
  });
  return Object.freeze({
    stone,
    mortar: new THREE.MeshStandardMaterial({
      color: new THREE.Color(
        STONE_PALETTES[recipe.style].base[0] / 255 * 0.56,
        STONE_PALETTES[recipe.style].base[1] / 255 * 0.56,
        STONE_PALETTES[recipe.style].base[2] / 255 * 0.56,
      ),
      roughness: 1,
      metalness: 0,
    }),
    wood: new THREE.MeshStandardMaterial({
      color: '#6b4226',
      roughness: 0.86,
      metalness: 0,
    }),
    roof,
    metal: new THREE.MeshStandardMaterial({
      color: '#b38a35',
      roughness: 0.48,
      metalness: 0.55,
      side: THREE.DoubleSide,
    }),
    foliage: new THREE.MeshStandardMaterial({
      color: '#3e732e',
      roughness: 0.94,
      metalness: 0,
    }),
    recess: new THREE.MeshStandardMaterial({
      color: '#17201d',
      roughness: 1,
      metalness: 0,
    }),
  });
}
