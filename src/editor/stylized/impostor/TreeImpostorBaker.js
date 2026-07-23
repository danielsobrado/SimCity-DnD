import * as THREE from 'three/webgpu';
import { createCaptureDirections } from './impostorFrame.js';

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function unionBounds(parts) {
  const bounds = new THREE.Box3();
  bounds.makeEmpty();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    bounds.union(part.geometry.boundingBox);
  }
  return bounds;
}

function createBakeMaterial(part, config, normalPass) {
  const sourceMap = part.sourceMap ?? null;
  if (normalPass) {
    const material = new THREE.MeshNormalMaterial({
      side: THREE.DoubleSide,
      map: sourceMap,
      alphaTest: sourceMap ? 0.5 : 0,
    });
    material.transparent = false;
    return material;
  }

  const material = new THREE.MeshBasicNodeMaterial({
    side: part.kind === 'leaf' ? THREE.DoubleSide : THREE.FrontSide,
  });
  material.colorNode = part.material.colorNode;
  material.opacityNode = part.material.opacityNode ?? null;
  material.alphaTest = part.material.alphaTest ?? (sourceMap ? 0.5 : 0);
  material.transparent = false;
  return material;
}

function createPrototypeScene(parts, config, normalPass) {
  const scene = new THREE.Scene();
  for (const part of parts) {
    const mesh = new THREE.Mesh(part.geometry, createBakeMaterial(part, config, normalPass));
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  return scene;
}

function disposeSceneMaterials(scene) {
  scene.traverse((node) => node.material?.dispose?.());
}

function createDilatedTile(pixels, sourceSize, tileSize, gutter) {
  const result = new Uint8ClampedArray(tileSize * tileSize * 4);
  for (let y = 0; y < tileSize; y += 1) {
    const sourceY = Math.max(0, Math.min(sourceSize - 1, y - gutter));
    for (let x = 0; x < tileSize; x += 1) {
      const sourceX = Math.max(0, Math.min(sourceSize - 1, x - gutter));
      const sourceOffset = ((sourceSize - sourceY - 1) * sourceSize + sourceX) * 4;
      const targetOffset = (y * tileSize + x) * 4;
      result[targetOffset] = pixels[sourceOffset];
      result[targetOffset + 1] = pixels[sourceOffset + 1];
      result[targetOffset + 2] = pixels[sourceOffset + 2];
      result[targetOffset + 3] = pixels[sourceOffset + 3];
    }
  }
  return result;
}

function writeTile(context, pixels, sourceSize, tileSize, gutter, column, row) {
  const data = createDilatedTile(pixels, sourceSize, tileSize, gutter);
  context.putImageData(new ImageData(data, tileSize, tileSize), column * tileSize, row * tileSize);
}

function configureAtlasTexture(canvas, colorSpace) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export class TreeImpostorBaker {
  constructor({ renderer, config, rendererFactory = null }) {
    this.sourceRenderer = renderer;
    this.config = config;
    this.rendererFactory = rendererFactory;
  }

  async createBakeRenderer() {
    if (this.rendererFactory) return this.rendererFactory();
    const renderer = new THREE.WebGPURenderer({
      antialias: false,
      forceWebGL: Boolean(
        this.sourceRenderer?.backend
        && !this.sourceRenderer.backend.isWebGPUBackend,
      ),
    });
    await renderer.init();
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return renderer;
  }

  async bake(prototypes) {
    const settings = this.config.lod.impostor;
    const renderer = await this.createBakeRenderer();
    const atlases = [];
    try {
      for (let prototypeIndex = 0; prototypeIndex < prototypes.length; prototypeIndex += 1) {
        atlases.push(await this.bakePrototype(
          prototypes[prototypeIndex],
          prototypeIndex,
          settings,
          renderer,
        ));
      }
      return Object.freeze(atlases);
    } finally {
      renderer.dispose();
    }
  }

  async bakePrototype(parts, prototypeIndex, settings, renderer) {
    const bounds = unionBounds(parts);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(0.1, size.length() * 0.5);
    const gutter = settings.gutter ?? 4;
    const renderSize = settings.tileSize - gutter * 2;
    const atlasWidth = settings.columns * settings.tileSize;
    const atlasHeight = settings.rows * settings.tileSize;
    const albedoCanvas = createCanvas(atlasWidth, atlasHeight);
    const normalCanvas = createCanvas(atlasWidth, atlasHeight);
    const albedoContext = albedoCanvas.getContext('2d', { alpha: true });
    const normalContext = normalCanvas.getContext('2d', { alpha: true });
    if (!albedoContext || !normalContext) {
      throw new Error('Tree impostor baking requires a 2D canvas context.');
    }
    albedoContext.clearRect(0, 0, atlasWidth, atlasHeight);
    normalContext.clearRect(0, 0, atlasWidth, atlasHeight);

    const target = new THREE.RenderTarget(renderSize, renderSize, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.colorSpace = THREE.NoColorSpace;
    const camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.01, radius * 6);
    const directions = createCaptureDirections(settings);
    const albedoScene = createPrototypeScene(parts, this.config, false);
    const normalScene = createPrototypeScene(parts, this.config, true);
    const previousTarget = renderer.getRenderTarget?.() ?? null;
    const previousAutoClear = renderer.autoClear;
    const previousClearColor = new THREE.Color();
    renderer.getClearColor?.(previousClearColor);
    const previousClearAlpha = renderer.getClearAlpha?.() ?? 1;

    try {
      renderer.autoClear = true;
      renderer.setClearColor(0x000000, 0);
      for (const direction of directions) {
        camera.position.set(
          center.x + direction.x * radius * 2.5,
          center.y + direction.y * radius * 2.5,
          center.z + direction.z * radius * 2.5,
        );
        camera.lookAt(center);
        camera.updateMatrixWorld(true);

        renderer.setRenderTarget(target);
        renderer.clear();
        renderer.render(albedoScene, camera);
        const albedoPixels = await renderer.readRenderTargetPixelsAsync(
          target,
          0,
          0,
          renderSize,
          renderSize,
        );
        writeTile(
          albedoContext,
          albedoPixels,
          renderSize,
          settings.tileSize,
          gutter,
          direction.column,
          direction.row,
        );

        renderer.clear();
        renderer.render(normalScene, camera);
        const normalPixels = await renderer.readRenderTargetPixelsAsync(
          target,
          0,
          0,
          renderSize,
          renderSize,
        );
        writeTile(
          normalContext,
          normalPixels,
          renderSize,
          settings.tileSize,
          gutter,
          direction.column,
          direction.row,
        );
      }
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      target.dispose();
      disposeSceneMaterials(albedoScene);
      disposeSceneMaterials(normalScene);
    }

    return Object.freeze({
      prototypeIndex,
      columns: settings.columns,
      rows: settings.rows,
      tileSize: settings.tileSize,
      gutter,
      lowElevationDegrees: settings.lowElevationDegrees,
      highElevationDegrees: settings.highElevationDegrees,
      width: radius * 2,
      height: radius * 2,
      depth: Math.max(0.1, size.z),
      centerY: center.y,
      radius,
      albedoCanvas,
      normalCanvas,
      albedo: configureAtlasTexture(albedoCanvas, THREE.SRGBColorSpace),
      normal: configureAtlasTexture(normalCanvas, THREE.NoColorSpace),
      source: 'runtime-bake',
    });
  }
}
