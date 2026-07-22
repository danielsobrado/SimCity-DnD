import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cellCenterToWorld, parseChunkKey } from '../world/WorldCoordinates.js';

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

function materialMatches(mesh, materialName) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) => material?.name === materialName);
}

function normalizeGeometry(mesh) {
  const geometry = mesh.geometry.clone();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  mesh.matrixWorld.decompose(position, quaternion, scale);
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(),
    quaternion,
    scale,
  ));
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const centerX = (bounds.min.x + bounds.max.x) * 0.5;
  const centerZ = (bounds.min.z + bounds.max.z) * 0.5;
  geometry.translate(-centerX, -bounds.min.y, -centerZ);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function cloneMaterial(mesh) {
  const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const material = source.clone();
  if ('roughness' in material) material.roughness = 1;
  if ('metalness' in material) material.metalness = 0;
  material.flatShading = true;
  material.needsUpdate = true;
  return material;
}

function disposeScene(scene) {
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => material?.dispose());
  });
}

export class StylizedRockView {
  constructor({ terrainView, config, baseUrl = '/', loader = new GLTFLoader() }) {
    this.terrainView = terrainView;
    this.config = config;
    this.loader = loader;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.prototypes = [];
    this.meshes = [];
    this.placements = [];
    this.signature = '';
    this.lastUpdateKey = null;
    this.disposed = false;
    this.ready = this.load();
  }

  resolveUrl(path) {
    return `${this.baseUrl}${path.replace(/^\/+/, '')}`;
  }

  async load() {
    if (!this.config.rocks.enabled) return;
    const gltf = await this.loader.loadAsync(this.resolveUrl(this.config.assets.scene));
    if (this.disposed) {
      disposeScene(gltf.scene);
      return;
    }
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((node) => {
      if (!node.isMesh || !materialMatches(node, this.config.assets.rockMaterial)) return;
      this.prototypes.push({
        geometry: normalizeGeometry(node),
        material: cloneMaterial(node),
      });
    });
    disposeScene(gltf.scene);
    if (this.prototypes.length === 0) {
      throw new Error(`No rock meshes use material ${this.config.assets.rockMaterial}.`);
    }

    const chunkCount = (this.config.rocks.residentRadius * 2 + 1) ** 2;
    const capacity = Math.ceil(chunkCount * this.config.rocks.perChunk / this.prototypes.length) + 8;
    this.meshes = this.prototypes.map((prototype, index) => {
      const mesh = new THREE.InstancedMesh(prototype.geometry, prototype.material, capacity);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.name = `stylized-rocks-${index}`;
      this.terrainView.scene.add(mesh);
      return mesh;
    });
  }

  update() {
    if (this.disposed || this.prototypes.length === 0 || !this.terrainView.focusChunkKey) return;
    const focus = parseChunkKey(this.terrainView.focusChunkKey);
    const origin = this.terrainView.floatingOrigin.getState();
    const updateKey = `${focus.chunkX}:${focus.chunkZ}:${origin.x}:${origin.z}:${this.terrainView.worldStore.revision}`;
    if (updateKey === this.lastUpdateKey) return;
    this.lastUpdateKey = updateKey;
    this.rebuild(focus);
  }

  rebuild(focus) {
    const matrices = this.prototypes.map(() => []);
    const placements = [];
    const tileIds = new Set(this.config.rocks.tileIds);
    const chunkSize = this.terrainView.worldStore.chunkSize;
    const tileSize = this.terrainView.worldStore.tileSize;
    const dummy = new THREE.Object3D();

    for (let chunkZ = focus.chunkZ - this.config.rocks.residentRadius;
      chunkZ <= focus.chunkZ + this.config.rocks.residentRadius;
      chunkZ += 1) {
      for (let chunkX = focus.chunkX - this.config.rocks.residentRadius;
        chunkX <= focus.chunkX + this.config.rocks.residentRadius;
        chunkX += 1) {
        for (let index = 0; index < this.config.rocks.perChunk; index += 1) {
          const cellX = chunkX * chunkSize + Math.floor(random01(chunkX, chunkZ, index, 0) * chunkSize);
          const cellZ = chunkZ * chunkSize + Math.floor(random01(chunkX, chunkZ, index, 1) * chunkSize);
          if (!tileIds.has(this.terrainView.tileMap.get(cellX, cellZ))) continue;
          const center = cellCenterToWorld(cellX, cellZ, tileSize);
          const jitterX = (random01(chunkX, chunkZ, index, 2) - 0.5) * tileSize;
          const jitterZ = (random01(chunkX, chunkZ, index, 3) - 0.5) * tileSize;
          const canonicalX = center.x + jitterX;
          const canonicalZ = center.z + jitterZ;
          const render = this.terrainView.floatingOrigin.toRender(canonicalX, canonicalZ);
          const height = this.terrainView.getCanonicalHeight(canonicalX, canonicalZ);
          const prototypeIndex = Math.floor(random01(chunkX, chunkZ, index, 4) * this.prototypes.length)
            % this.prototypes.length;
          const scale = this.config.rocks.minScale
            + random01(chunkX, chunkZ, index, 5)
              * (this.config.rocks.maxScale - this.config.rocks.minScale);
          dummy.position.set(render.x, height, render.z);
          dummy.rotation.set(0, random01(chunkX, chunkZ, index, 6) * Math.PI * 2, 0);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          matrices[prototypeIndex].push(dummy.matrix.clone());
          placements.push({
            x: canonicalX,
            z: canonicalZ,
            radius: this.config.rocks.radius * scale,
          });
        }
      }
    }

    this.meshes.forEach((mesh, prototypeIndex) => {
      const values = matrices[prototypeIndex];
      mesh.count = Math.min(values.length, mesh.instanceMatrix.count);
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.setMatrixAt(index, values[index]);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
    this.placements = placements;
    this.signature = `${this.lastUpdateKey}:${placements.length}`;
  }

  getPlacements() {
    return this.placements;
  }

  getSignature() {
    return this.signature;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.meshes) {
      this.terrainView.scene.remove(mesh);
      mesh.dispose();
    }
    this.meshes.length = 0;
    this.prototypes.length = 0;
    this.placements.length = 0;
  }
}
