import * as THREE from 'three/webgpu';
import { createTerrainMaterial } from './terrainMaterial.js';
import { TILE_BY_ID, hexToRgbBytes } from './tileCatalog.js';

const PICK_ITERATIONS = 5;
const PREVIEW_HEIGHT_OFFSET = 0.08;

export class TerrainView {
  constructor({ container, tileMap, heightField, chunkSize, rendererConfig }) {
    this.container = container;
    this.tileMap = tileMap;
    this.heightField = heightField;
    this.chunkSize = chunkSize;
    this.worldWidth = tileMap.width * tileMap.tileSize;
    this.worldDepth = tileMap.height * tileMap.tileSize;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.pickPoint = new THREE.Vector3();

    this.renderer = new THREE.WebGPURenderer({
      antialias: rendererConfig.antialias,
      forceWebGL: rendererConfig.forceWebGL,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, rendererConfig.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.domElement.setAttribute('aria-label', 'SimCity DnD world editor viewport');
    container.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0a100c');

    this.texturePixels = new Uint8Array(tileMap.tileCount * 4);
    this.tileTexture = new THREE.DataTexture(
      this.texturePixels,
      tileMap.width,
      tileMap.height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.tileTexture.magFilter = THREE.NearestFilter;
    this.tileTexture.minFilter = THREE.NearestFilter;
    this.tileTexture.generateMipmaps = false;
    this.tileTexture.colorSpace = THREE.SRGBColorSpace;

    this.heightTexture = new THREE.DataTexture(
      heightField.heights,
      heightField.vertexWidth,
      heightField.vertexHeight,
      THREE.RedFormat,
      THREE.FloatType,
    );
    this.heightTexture.magFilter = THREE.NearestFilter;
    this.heightTexture.minFilter = THREE.NearestFilter;
    this.heightTexture.generateMipmaps = false;
    this.heightTexture.unpackAlignment = 1;

    this.terrainMaterial = createTerrainMaterial({
      tileTexture: this.tileTexture,
      heightTexture: this.heightTexture,
      width: tileMap.width,
      height: tileMap.height,
      chunkSize,
    });

    this.terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(
        this.worldWidth,
        this.worldDepth,
        tileMap.width,
        tileMap.height,
      ),
      this.terrainMaterial,
    );
    this.terrain.rotation.x = -Math.PI / 2;
    this.terrain.name = 'terrain';
    this.scene.add(this.terrain);

    this.preview = new THREE.Mesh(
      new THREE.PlaneGeometry(tileMap.tileSize, tileMap.tileSize),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.preview.rotation.x = -Math.PI / 2;
    this.preview.visible = false;
    this.scene.add(this.preview);

    const edgePoints = [
      new THREE.Vector3(-this.worldWidth / 2, 0.025, -this.worldDepth / 2),
      new THREE.Vector3(this.worldWidth / 2, 0.025, -this.worldDepth / 2),
      new THREE.Vector3(this.worldWidth / 2, 0.025, this.worldDepth / 2),
      new THREE.Vector3(-this.worldWidth / 2, 0.025, this.worldDepth / 2),
    ];
    this.borderGeometry = new THREE.BufferGeometry().setFromPoints(edgePoints);
    this.borderMaterial = new THREE.LineBasicMaterial({
      color: '#d4b65e',
      transparent: true,
      opacity: 0.75,
    });
    this.border = new THREE.LineLoop(this.borderGeometry, this.borderMaterial);
    this.scene.add(this.border);

    this.refreshAll();
  }

  async initialize() {
    await this.renderer.init();
  }

  setAnimationLoop(callback) {
    this.renderer.setAnimationLoop(callback);
  }

  resize(width, height) {
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
  }

  refreshAll() {
    for (let index = 0; index < this.tileMap.tileCount; index += 1) {
      this.writePixel(index, this.tileMap.tiles[index]);
    }
    this.tileTexture.needsUpdate = true;
    this.heightTexture.needsUpdate = true;
  }

  updatePatch(patch) {
    for (const index of patch.indices) {
      this.writePixel(index, this.tileMap.tiles[index]);
    }
    this.tileTexture.needsUpdate = true;
  }

  updateHeightPatch() {
    this.heightTexture.needsUpdate = true;
    if (this.preview.visible && this.preview.userData.cell) {
      this.positionPreview(this.preview.userData.cell);
    }
  }

  writePixel(index, tileId) {
    const tile = TILE_BY_ID.get(tileId);
    if (!tile) {
      throw new Error(`Unknown tile id: ${tileId}.`);
    }

    const [red, green, blue] = hexToRgbBytes(tile.color);
    const offset = index * 4;
    this.texturePixels[offset] = red;
    this.texturePixels[offset + 1] = green;
    this.texturePixels[offset + 2] = blue;
    this.texturePixels[offset + 3] = 255;
  }

  pickCell(clientX, clientY, camera) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return null;
    }

    this.pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, camera);
    this.pickPlane.constant = 0;

    if (!this.raycaster.ray.intersectPlane(this.pickPlane, this.pickPoint)) {
      return null;
    }

    for (let iteration = 0; iteration < PICK_ITERATIONS; iteration += 1) {
      const height = this.getWorldHeight(this.pickPoint.x, this.pickPoint.z);
      this.pickPlane.constant = -height;
      if (!this.raycaster.ray.intersectPlane(this.pickPlane, this.pickPoint)) {
        return null;
      }
    }

    const x = Math.floor((this.pickPoint.x + this.worldWidth / 2) / this.tileMap.tileSize);
    const z = Math.floor((this.worldDepth / 2 - this.pickPoint.z) / this.tileMap.tileSize);
    return this.tileMap.inBounds(x, z) ? { x, z } : null;
  }

  getWorldHeight(worldX, worldZ) {
    const cellX = (worldX + this.worldWidth / 2) / this.tileMap.tileSize;
    const cellZ = (this.worldDepth / 2 - worldZ) / this.tileMap.tileSize;
    return this.heightField.sample(cellX, cellZ);
  }

  setPreview(cell, brushSize, color) {
    if (!cell) {
      this.preview.visible = false;
      this.preview.userData.cell = null;
      return;
    }

    this.preview.userData.cell = cell;
    this.positionPreview(cell);
    this.preview.scale.set(brushSize, brushSize, 1);
    this.preview.material.color.set(color);
    this.preview.visible = true;
  }

  positionPreview(cell) {
    const world = this.cellToWorld(cell.x, cell.z);
    this.preview.position.set(world.x, world.y + PREVIEW_HEIGHT_OFFSET, world.z);
  }

  cellToWorld(x, z) {
    return {
      x: (x + 0.5) * this.tileMap.tileSize - this.worldWidth / 2,
      y: this.heightField.getCellHeight(x, z) ?? 0,
      z: this.worldDepth / 2 - (z + 0.5) * this.tileMap.tileSize,
    };
  }

  boundsToWorld(bounds) {
    const min = this.cellToWorld(bounds.minX, bounds.minZ);
    const max = this.cellToWorld(bounds.maxX, bounds.maxZ);
    return {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    };
  }

  dispose() {
    this.setAnimationLoop(null);
    this.terrain.geometry.dispose();
    this.terrainMaterial.dispose();
    this.tileTexture.dispose();
    this.heightTexture.dispose();
    this.preview.geometry.dispose();
    this.preview.material.dispose();
    this.borderGeometry.dispose();
    this.borderMaterial.dispose();
    this.renderer.dispose();
  }
}
