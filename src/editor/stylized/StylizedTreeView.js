import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { uniform } from 'three/tsl';
import { cellCenterToWorld, parseChunkKey } from '../world/WorldCoordinates.js';
import {
  createStylizedLeafMaterial,
  createStylizedTrunkMaterial,
} from './StylizedTreeMaterials.js';

function normalizeBaseUrl(baseUrl) {
  const value = typeof baseUrl === 'string' && baseUrl.length > 0 ? baseUrl : '/';
  return value.endsWith('/') ? value : `${value}/`;
}

function hash32(value) {
  let result = value | 0;
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
}

function random01(chunkX, chunkZ, index, channel) {
  const seed = Math.imul(chunkX, 73856093)
    ^ Math.imul(chunkZ, 19349663)
    ^ Math.imul(index + 1, 83492791)
    ^ Math.imul(channel + 1, 1597334677);
  return hash32(seed) / 0xffffffff;
}

function materialList(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function meshKind(mesh, config) {
  const names = materialList(mesh).map((material) => material?.name);
  if (names.includes(config.assets.leafMaterial)) return 'leaf';
  if (names.includes(config.assets.trunkMaterial)) return 'trunk';
  return null;
}

function subtreeKinds(root, config) {
  let hasLeaf = false;
  let hasTrunk = false;
  root.traverse((node) => {
    if (!node.isMesh) return;
    const kind = meshKind(node, config);
    hasLeaf ||= kind === 'leaf';
    hasTrunk ||= kind === 'trunk';
  });
  return { hasLeaf, hasTrunk };
}

function findPrototypeRoots(root, config) {
  const kinds = subtreeKinds(root, config);
  if (!kinds.hasLeaf || !kinds.hasTrunk) return [];
  const nested = root.children.flatMap((child) => findPrototypeRoots(child, config));
  return nested.length > 0 ? nested : [root];
}

function cloneGeometryRelativeToRoot(mesh, root) {
  const inverseRoot = root.matrixWorld.clone().invert();
  const relative = inverseRoot.multiply(mesh.matrixWorld);
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(relative);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  return geometry;
}

function firstMaterial(mesh, name) {
  return materialList(mesh).find((material) => material?.name === name) ?? materialList(mesh)[0];
}

function disposeScene(scene) {
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose();
    materialList(node).forEach((material) => material?.dispose());
  });
}

function configureBarkTexture(texture, colorSpace) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class StylizedTreeView {
  constructor({ terrainView, config, baseUrl = '/', loader = new GLTFLoader() }) {
    this.terrainView = terrainView;
    this.config = config;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.loader = loader;
    this.textureLoader = new THREE.TextureLoader();
    this.time = uniform(0);
    this.prototypes = [];
    this.renderers = [];
    this.textures = [];
    this.sourceScene = null;
    this.lastUpdateKey = null;
    this.disposed = false;
    this.ready = this.load();
  }

  resolveUrl(path) {
    return `${this.baseUrl}${path.replace(/^\/+/, '')}`;
  }

  async loadBarkTextures() {
    const [color, ao, height] = await Promise.all([
      this.textureLoader.loadAsync(this.resolveUrl(this.config.assets.barkColor)),
      this.textureLoader.loadAsync(this.resolveUrl(this.config.assets.barkAo)),
      this.textureLoader.loadAsync(this.resolveUrl(this.config.assets.barkHeight)),
    ]);
    configureBarkTexture(color, THREE.SRGBColorSpace);
    configureBarkTexture(ao, THREE.NoColorSpace);
    configureBarkTexture(height, THREE.NoColorSpace);
    this.textures.push(color, ao, height);
    return { color, ao, height };
  }

  async load() {
    if (!this.config.trees.enabled) return;
    const [gltf, barkTextures] = await Promise.all([
      this.loader.loadAsync(this.resolveUrl(this.config.assets.scene)),
      this.loadBarkTextures(),
    ]);
    if (this.disposed) {
      disposeScene(gltf.scene);
      return;
    }
    this.sourceScene = gltf.scene;
    gltf.scene.updateMatrixWorld(true);
    const roots = gltf.scene.children.flatMap((child) => findPrototypeRoots(child, this.config));
    if (roots.length === 0) {
      throw new Error('No pine prototype contains both configured trunk and leaf materials.');
    }

    for (const root of roots) {
      const parts = [];
      root.traverse((node) => {
        if (!node.isMesh) return;
        const kind = meshKind(node, this.config);
        if (!kind) return;
        const geometry = cloneGeometryRelativeToRoot(node, root);
        const source = firstMaterial(
          node,
          kind === 'leaf' ? this.config.assets.leafMaterial : this.config.assets.trunkMaterial,
        );
        const material = kind === 'leaf'
          ? createStylizedLeafMaterial({
            source,
            bounds: {
              minY: geometry.boundingBox.min.y,
              maxY: geometry.boundingBox.max.y,
            },
            time: this.time,
            config: this.config,
          })
          : createStylizedTrunkMaterial({ textures: barkTextures, config: this.config });
        parts.push({ geometry, material, kind });
      });
      if (parts.length > 0) this.prototypes.push(parts);
    }
    if (this.prototypes.length === 0) {
      throw new Error('Pine prototype extraction produced no renderable parts.');
    }

    const chunkCount = (this.config.trees.residentRadius * 2 + 1) ** 2;
    const capacity = Math.ceil(chunkCount * this.config.trees.perChunk / this.prototypes.length) + 8;
    this.renderers = this.prototypes.map((parts, prototypeIndex) => parts.map((part, partIndex) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = part.kind === 'trunk';
      mesh.receiveShadow = true;
      mesh.name = `stylized-pine-${prototypeIndex}-${partIndex}`;
      this.terrainView.scene.add(mesh);
      return mesh;
    }));
  }

  update(timestamp) {
    this.time.value = timestamp / 1000;
    if (this.disposed || this.renderers.length === 0 || !this.terrainView.focusChunkKey) return;
    const focus = parseChunkKey(this.terrainView.focusChunkKey);
    const origin = this.terrainView.floatingOrigin.getState();
    const updateKey = `${focus.chunkX}:${focus.chunkZ}:${origin.x}:${origin.z}:${this.terrainView.worldStore.revision}`;
    if (updateKey === this.lastUpdateKey) return;
    this.lastUpdateKey = updateKey;
    this.rebuild(focus);
  }

  rebuild(focus) {
    const matrices = this.prototypes.map(() => []);
    const tileIds = new Set(this.config.trees.tileIds);
    const chunkSize = this.terrainView.worldStore.chunkSize;
    const tileSize = this.terrainView.worldStore.tileSize;
    const dummy = new THREE.Object3D();

    for (let chunkZ = focus.chunkZ - this.config.trees.residentRadius;
      chunkZ <= focus.chunkZ + this.config.trees.residentRadius;
      chunkZ += 1) {
      for (let chunkX = focus.chunkX - this.config.trees.residentRadius;
        chunkX <= focus.chunkX + this.config.trees.residentRadius;
        chunkX += 1) {
        for (let index = 0; index < this.config.trees.perChunk; index += 1) {
          const cellX = chunkX * chunkSize + Math.floor(random01(chunkX, chunkZ, index, 0) * chunkSize);
          const cellZ = chunkZ * chunkSize + Math.floor(random01(chunkX, chunkZ, index, 1) * chunkSize);
          if (!tileIds.has(this.terrainView.tileMap.get(cellX, cellZ))) continue;
          const canonical = cellCenterToWorld(cellX, cellZ, tileSize);
          const jitterX = (random01(chunkX, chunkZ, index, 2) - 0.5) * tileSize;
          const jitterZ = (random01(chunkX, chunkZ, index, 3) - 0.5) * tileSize;
          const canonicalX = canonical.x + jitterX;
          const canonicalZ = canonical.z + jitterZ;
          const render = this.terrainView.floatingOrigin.toRender(canonicalX, canonicalZ);
          const height = this.terrainView.getCanonicalHeight(canonicalX, canonicalZ);
          const prototypeIndex = Math.floor(random01(chunkX, chunkZ, index, 4) * this.prototypes.length)
            % this.prototypes.length;
          const scale = this.config.trees.minScale
            + random01(chunkX, chunkZ, index, 5)
              * (this.config.trees.maxScale - this.config.trees.minScale);
          dummy.position.set(render.x, height, render.z);
          dummy.rotation.set(0, random01(chunkX, chunkZ, index, 6) * Math.PI * 2, 0);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          matrices[prototypeIndex].push(dummy.matrix.clone());
        }
      }
    }

    this.renderers.forEach((parts, prototypeIndex) => {
      const values = matrices[prototypeIndex];
      for (const mesh of parts) {
        mesh.count = Math.min(values.length, mesh.instanceMatrix.count);
        for (let index = 0; index < mesh.count; index += 1) {
          mesh.setMatrixAt(index, values[index]);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const parts of this.renderers) {
      for (const mesh of parts) {
        this.terrainView.scene.remove(mesh);
        mesh.dispose();
      }
    }
    this.renderers.length = 0;
    this.prototypes.length = 0;
    this.textures.forEach((texture) => texture.dispose());
    this.textures.length = 0;
    if (this.sourceScene) disposeScene(this.sourceScene);
    this.sourceScene = null;
  }
}
