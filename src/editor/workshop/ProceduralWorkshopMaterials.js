import * as THREE from 'three/webgpu';
import { mixSeed } from './ProceduralRandom.js';

export const STONE_PALETTES = Object.freeze({
  granite: Object.freeze({ base: [137, 143, 146], warm: [165, 154, 136], color: '#91979a' }),
  limestone: Object.freeze({ base: [194, 180, 148], warm: [220, 202, 154], color: '#c4b794' }),
  sandstone: Object.freeze({ base: [187, 122, 78], warm: [220, 159, 98], color: '#bd8056' }),
});

export const PLASTER_PALETTES = Object.freeze({
  masonry: Object.freeze({ base: [134, 132, 121], shadow: [96, 99, 91] }),
  ochre: Object.freeze({ base: [218, 161, 61], shadow: [173, 112, 39] }),
  limewash: Object.freeze({ base: [218, 209, 177], shadow: [166, 157, 130] }),
  rose: Object.freeze({ base: [190, 116, 99], shadow: [145, 78, 70] }),
});

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function createTexture(size, pixel, { colorSpace = THREE.SRGBColorSpace } = {}) {
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
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function stoneTexture(recipe) {
  const palette = STONE_PALETTES[recipe.style];
  return createTexture(256, (x, y) => {
    const broad = (mixSeed(recipe.seed + Math.floor(y / 18), Math.floor(x / 18)) & 255) / 255;
    const grain = (mixSeed(recipe.seed + y * 131, x * 17) & 255) / 255;
    const damp = recipe.weathering * Math.max(0, 1 - y / 72);
    const value = (broad - 0.5) * 15 + (grain - 0.5) * 8 - damp * 14;
    return palette.base.map((channel, index) => (
      channel + value + (index === 1 ? damp * 4 : 0)
    ));
  });
}

function surfaceBumpTexture(seed, scale = 1) {
  return createTexture(128, (x, y) => {
    const fine = mixSeed(seed + y * 719, x * 313) & 255;
    const broad = mixSeed(seed + Math.floor(y / 5), Math.floor(x / 5)) & 255;
    const value = 112 + (fine - 127) * 0.16 * scale + (broad - 127) * 0.13 * scale;
    return [value, value, value];
  }, { colorSpace: THREE.NoColorSpace });
}

function roofTexture(topStyle, seed) {
  const slate = topStyle === 'slate';
  const base = slate ? [86, 101, 91] : [177, 87, 51];
  return createTexture(256, (x, y) => {
    const rowHeight = 20;
    const tileWidth = 30;
    const row = Math.floor(y / rowHeight);
    const tileX = (x + (row % 2) * tileWidth / 2) % tileWidth;
    const localY = y % rowHeight;
    const seam = tileX < 2 || localY < 2;
    const lowerShade = Math.max(0, (localY - rowHeight * 0.68) / (rowHeight * 0.32)) * 10;
    const noise = ((mixSeed(seed + row, Math.floor((x + row * 11) / tileWidth)) & 255) / 255 - 0.5) * 22;
    return base.map((channel, index) => (
      channel + noise - (seam ? 30 : 0) - lowerShade + (index === 1 && slate ? 4 : 0)
    ));
  });
}

function roofBumpTexture(seed) {
  return createTexture(256, (x, y) => {
    const rowHeight = 20;
    const tileWidth = 30;
    const row = Math.floor(y / rowHeight);
    const tileX = (x + (row % 2) * tileWidth / 2) % tileWidth;
    const localY = y % rowHeight;
    const seam = tileX < 2 || localY < 2;
    const grain = (mixSeed(seed + y * 37, x * 19) & 31) - 15;
    const value = seam ? 54 : 160 + grain;
    return [value, value, value];
  }, { colorSpace: THREE.NoColorSpace });
}

function plasterTexture(recipe) {
  const palette = PLASTER_PALETTES[recipe.finish];
  return createTexture(256, (x, y) => {
    const coarse = (mixSeed(recipe.seed + Math.floor(y / 10), Math.floor(x / 10)) & 255) / 255;
    const fine = (mixSeed(recipe.seed + y * 97, x * 61) & 255) / 255;
    const age = recipe.weathering * Math.max(0, 1 - y / 100);
    const mottling = (coarse - 0.5) * 12 + (fine - 0.5) * 5;
    return palette.base.map((channel, index) => (
      channel + mottling - age * (index === 1 ? 12 : 20)
    ));
  });
}

function woodTexture(seed) {
  return createTexture(128, (x, y) => {
    const grain = Math.sin((x + Math.sin(y * 0.18) * 7) * 0.23) * 8;
    const noise = ((mixSeed(seed + y * 11, x * 5) & 255) / 255 - 0.5) * 9;
    return [105 + grain + noise, 65 + grain * 0.55 + noise, 35 + noise * 0.5];
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
  const stoneBump = surfaceBumpTexture(recipe.seed, 1);
  const roofBump = roofBumpTexture(recipe.seed);
  const plasterBump = surfaceBumpTexture(recipe.seed + 913, 0.72);
  const stone = new THREE.MeshStandardMaterial({
    color: recipe.albedo ? '#ffffff' : STONE_PALETTES[recipe.style].color,
    map: recipe.albedo ? stoneTexture(recipe) : null,
    bumpMap: stoneBump,
    bumpScale: 0.055,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
  });
  const roof = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: roofTexture(recipe.topStyle, recipe.seed),
    bumpMap: roofBump,
    bumpScale: 0.095,
    roughness: 0.8,
    metalness: 0,
  });
  return Object.freeze({
    stone,
    mortar: new THREE.MeshStandardMaterial({
      color: recipe.finish === 'masonry'
        ? new THREE.Color(
          STONE_PALETTES[recipe.style].base[0] / 255 * 0.66,
          STONE_PALETTES[recipe.style].base[1] / 255 * 0.66,
          STONE_PALETTES[recipe.style].base[2] / 255 * 0.66,
        )
        : '#ffffff',
      map: recipe.finish === 'masonry' ? null : plasterTexture(recipe),
      bumpMap: plasterBump,
      bumpScale: recipe.finish === 'masonry' ? 0.025 : 0.075,
      roughness: 0.96,
      metalness: 0,
    }),
    wood: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: woodTexture(recipe.seed),
      bumpMap: surfaceBumpTexture(recipe.seed + 317, 0.5),
      bumpScale: 0.035,
      roughness: 0.82,
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
      color: '#4c8a37',
      roughness: 0.9,
      metalness: 0,
    }),
    recess: new THREE.MeshStandardMaterial({
      color: '#233b43',
      roughness: 0.62,
      metalness: 0.05,
      emissive: '#071216',
      emissiveIntensity: 0.18,
    }),
  });
}
