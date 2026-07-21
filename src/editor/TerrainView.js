import * as THREE from 'three';
import { TILE_BY_ID, hexToRgbBytes } from './tileCatalog.js';

const TERRAIN_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TERRAIN_FRAGMENT_SHADER = `
  uniform sampler2D tileTexture;
  uniform vec2 mapSize;
  uniform float chunkSize;
  varying vec2 vUv;

  float gridLine(vec2 coordinate, float width) {
    vec2 edge = min(fract(coordinate), 1.0 - fract(coordinate));
    return 1.0 - smoothstep(0.0, width, min(edge.x, edge.y));
  }

  void main() {
    vec4 tileColor = texture2D(tileTexture, vUv);
    float cellGrid = gridLine(vUv * mapSize, 0.045);
    float chunkGrid = gridLine(vUv * (mapSize / chunkSize), 0.018);

    vec3 color = mix(tileColor.rgb, vec3(0.035, 0.045, 0.038), cellGrid * 0.22);
    color = mix(color, vec3(0.84, 0.71, 0.36), chunkGrid * 0.38);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export class TerrainView {
  constructor({ container, tileMap, chunkSize }) {
    this.container = container;
    this.tileMap = tileMap;
    this.chunkSize = chunkSize;
    this.worldWidth = tileMap.width * tileMap.tileSize;
    this.worldDepth = tileMap.height * tileMap.tileSize;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    this.terrainMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tileTexture: { value: this.tileTexture },
        mapSize: { value: new THREE.Vector2(tileMap.width, tileMap.height) },
        chunkSize: { value: chunkSize },
      },
      vertexShader: TERRAIN_VERTEX_SHADER,
      fragmentShader: TERRAIN_FRAGMENT_SHADER,
    });

    this.terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(this.worldWidth, this.worldDepth),
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
    this.preview.position.y = 0.05;
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
  }

  updatePatch(patch) {
    for (const index of patch.indices) {
      this.writePixel(index, this.tileMap.tiles[index]);
    }
    this.tileTexture.needsUpdate = true;
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

    const hit = this.raycaster.intersectObject(this.terrain, false)[0];
    if (!hit?.uv) {
      return null;
    }

    const x = Math.min(this.tileMap.width - 1, Math.floor(hit.uv.x * this.tileMap.width));
    const z = Math.min(this.tileMap.height - 1, Math.floor(hit.uv.y * this.tileMap.height));
    return { x, z };
  }

  setPreview(cell, brushSize, color) {
    if (!cell) {
      this.preview.visible = false;
      return;
    }

    const world = this.cellToWorld(cell.x, cell.z);
    this.preview.position.x = world.x;
    this.preview.position.z = world.z;
    this.preview.scale.set(brushSize, brushSize, 1);
    this.preview.material.color.set(color);
    this.preview.visible = true;
  }

  cellToWorld(x, z) {
    return {
      x: (x + 0.5) * this.tileMap.tileSize - this.worldWidth / 2,
      z: this.worldDepth / 2 - (z + 0.5) * this.tileMap.tileSize,
    };
  }

  boundsToWorld(bounds) {
    const min = this.cellToWorld(bounds.minX, bounds.minZ);
    const max = this.cellToWorld(bounds.maxX, bounds.maxZ);
    return {
      x: (min.x + max.x) / 2,
      z: (min.z + max.z) / 2,
    };
  }

  dispose() {
    this.terrain.geometry.dispose();
    this.terrainMaterial.dispose();
    this.tileTexture.dispose();
    this.preview.geometry.dispose();
    this.preview.material.dispose();
    this.borderGeometry.dispose();
    this.borderMaterial.dispose();
    this.renderer.dispose();
  }
}
