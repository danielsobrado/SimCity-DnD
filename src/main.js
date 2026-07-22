import './styles.css';
import './editor/performance/frameRateDisplay.css';
import './editor/player/playerMode.css';
import { loadEditorConfig } from './config/loadEditorConfig.js';
import { installObjectAssets } from './editor/assets/installObjectAssets.js';
import { EditorCamera } from './editor/EditorCamera.js';
import { EditorUi } from './editor/EditorUi.js';
import { InfiniteTerrainView } from './editor/InfiniteTerrainView.js';
import { ObjectMap } from './editor/ObjectMap.js';
import { ObjectView } from './editor/ObjectView.js';
import { OBJECT_CATALOG } from './editor/objectCatalog.js';
import { OBJECT_RENDER_CATALOG } from './editor/objectRenderCatalog.js';
import { FrameRateDisplay } from './editor/performance/FrameRateDisplay.js';
import { FrameRateMeter } from './editor/performance/FrameRateMeter.js';
import { FRAME_RATE_DISPLAY_INTERVAL_MS } from './editor/performance/frameRateConstants.js';
import { PlayerController } from './editor/player/PlayerController.js';
import { ViewModeController } from './editor/player/ViewModeController.js';
import { ViewModeUi } from './editor/player/ViewModeUi.js';
import { StylizedSurfaceView } from './editor/stylized/StylizedSurfaceView.js';
import { TerrainAwareEditorController } from './editor/TerrainAwareEditorController.js';
import { TILE_BY_KEY, TILE_CATALOG } from './editor/tileCatalog.js';
import { GpuVoxelWorld } from './editor/voxel/GpuVoxelWorld.js';
import { VoxelPrototypeUi } from './editor/voxel/VoxelPrototypeUi.js';
import { VoxelStampStore } from './editor/voxel/VoxelStampStore.js';
import { createVoxelWorldLayout } from './editor/voxel/VoxelWorldLayout.js';
import { ChunkedHeightField } from './editor/world/ChunkedHeightField.js';
import { ChunkedTileMap } from './editor/world/ChunkedTileMap.js';
import { FloatingOrigin } from './editor/world/FloatingOrigin.js';
import { ProceduralWorldGenerator } from './editor/world/ProceduralWorldGenerator.js';
import { WorkerBackedWorldStore } from './editor/world/WorkerBackedWorldStore.js';
import { WorldChunkWorkerClient } from './editor/world/WorldChunkWorkerClient.js';

const TERRAIN_PREFETCH_REFRESH_MS = 200;

async function startEditor() {
  const config = loadEditorConfig();
  const defaultTile = TILE_BY_KEY.get(config.map.defaultTile);
  if (!defaultTile) {
    throw new Error(`Unknown default tile: ${config.map.defaultTile}.`);
  }

  const root = document.querySelector('#app');
  const generator = new ProceduralWorldGenerator({
    seed: config.world.seed,
    version: config.world.generatorVersion,
    heightScale: config.world.heightScale,
    seaLevel: config.world.seaLevel,
  });
  const chunkWorker = new WorldChunkWorkerClient({
    chunkSize: config.world.chunkSize,
    generator,
  });
  const worldStore = new WorkerBackedWorldStore({
    chunkWorker,
    chunkSize: config.world.chunkSize,
    tileSize: config.map.tileSize,
    cacheLimit: config.world.maxCpuChunks,
    generator,
  });
  const tileMap = new ChunkedTileMap({ worldStore, defaultTileId: defaultTile.id });
  const heightField = new ChunkedHeightField({ worldStore });
  const objectMap = new ObjectMap({ tileMap, objectCatalog: OBJECT_CATALOG });
  const floatingOrigin = new FloatingOrigin({
    threshold: config.world.floatingOriginThreshold,
    snapSize: config.world.chunkSize * config.map.tileSize,
  });

  const voxelWorldLayout = createVoxelWorldLayout(config.voxelPrototype, config.map);
  const voxelStampStore = new VoxelStampStore({
    cells: [0, voxelWorldLayout.totalCellsY, 0],
    legacyCells: config.voxelPrototype.cells,
    maxStamps: config.voxelPrototype.maxStamps,
    unboundedXZ: true,
  });

  const ui = new EditorUi({
    root,
    config,
    tileCatalog: TILE_CATALOG,
    tileMap,
    heightField,
    objectCatalog: OBJECT_CATALOG,
    objectMap,
  });
  const frameRateDisplay = new FrameRateDisplay({ root });
  const frameRateMeter = new FrameRateMeter();

  const terrainView = new InfiniteTerrainView({
    container: ui.viewport,
    tileMap,
    heightField,
    worldStore,
    floatingOrigin,
    streamingConfig: config.world,
    rendererConfig: config.renderer,
    stylizedConfig: config.stylizedSurface,
  });

  try {
    await terrainView.initialize();
  } catch (error) {
    terrainView.dispose();
    worldStore.dispose();
    throw error;
  }

  const objectView = new ObjectView({
    terrainView,
    tileMap,
    heightField,
    objectMap,
    objectCatalog: OBJECT_CATALOG,
  });
  const stylizedSurface = new StylizedSurfaceView({
    terrainView,
    objectMap,
    config: config.stylizedSurface,
  });

  const editorCamera = new EditorCamera({
    canvas: terrainView.renderer.domElement,
    viewSize: config.camera.viewSize,
    minZoom: config.camera.minZoom,
    maxZoom: config.camera.maxZoom,
    damping: config.camera.damping,
  });
  const playerController = new PlayerController({
    canvas: terrainView.renderer.domElement,
    terrainView,
    config: config.player,
  });
  const viewModeController = new ViewModeController({
    editorCamera,
    playerController,
  });

  const controller = new TerrainAwareEditorController({
    tileMap,
    heightField,
    worldStore,
    objectMap,
    terrainView,
    objectView,
    editorCamera,
    objectCatalog: OBJECT_CATALOG,
    brushSizes: config.brush.sizes,
    defaultBrushSize: config.brush.defaultSize,
    terrainConfig: config.terrain,
    voxelStampStore,
  });
  controller.focusProvider = () => {
    const renderFocus = viewModeController.getFocusWorld();
    return floatingOrigin.toCanonical(renderFocus.x, renderFocus.z);
  };

  ui.bind(controller);
  const viewModeUi = new ViewModeUi({ root, controller: viewModeController });
  const assetPipeline = installObjectAssets({
    objectView,
    catalog: OBJECT_RENDER_CATALOG,
    tileSize: tileMap.tileSize,
    ui,
    baseUrl: import.meta.env.BASE_URL,
  });

  const voxelPrototype = new GpuVoxelWorld({
    terrainView,
    layout: voxelWorldLayout,
    stampStore: voxelStampStore,
  });
  const voxelPrototypeUi = new VoxelPrototypeUi({
    root,
    prototype: voxelPrototype,
    controller,
    stampStore: voxelStampStore,
  });
  const voxelStatus = await voxelPrototype.initialize({ x: 0, z: 0 });
  voxelPrototypeUi.render();
  if (voxelStatus.code === 'failed') {
    console.error('GPU voxel world failed to initialize.', voxelStatus.error);
  }

  const resizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    terrainView.resize(width, height);
    viewModeController.resize(width, height);
  });
  resizeObserver.observe(ui.viewport);

  let active = true;
  let nextFrameRateDisplayAt = 0;
  let nextStreamingStatusAt = 0;
  let nextPredictiveRefreshAt = 0;
  const onVisibilityChange = () => {
    if (!document.hidden) return;
    frameRateMeter.reset();
    frameRateDisplay.update(null);
    nextFrameRateDisplayAt = 0;
    nextPredictiveRefreshAt = 0;
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  terrainView.setAnimationLoop((timestamp) => {
    if (!active) return;

    const frameTimestamp = Number.isFinite(timestamp) ? timestamp : performance.now();
    const averageFps = frameRateMeter.record(frameTimestamp);
    if (frameTimestamp >= nextFrameRateDisplayAt) {
      frameRateDisplay.update(averageFps);
      nextFrameRateDisplayAt = frameTimestamp + FRAME_RATE_DISPLAY_INTERVAL_MS;
    }

    viewModeController.update(frameTimestamp);
    let renderFocus = viewModeController.getFocusWorld();
    const rebase = terrainView.updateFloatingOrigin(renderFocus);
    if (rebase) {
      viewModeController.shiftWorld(rebase.shiftX, rebase.shiftZ);
      controller.refreshObjects();
      renderFocus = viewModeController.getFocusWorld();
    }
    const canonicalFocus = floatingOrigin.toCanonical(renderFocus.x, renderFocus.z);
    const forcePredictiveRefresh = frameTimestamp >= nextPredictiveRefreshAt;
    if (forcePredictiveRefresh) {
      nextPredictiveRefreshAt = frameTimestamp + TERRAIN_PREFETCH_REFRESH_MS;
    }
    terrainView.updateStreaming(
      canonicalFocus,
      frameTimestamp,
      forcePredictiveRefresh,
    ).catch((error) => {
      console.error('Terrain streaming update failed.', error);
    });
    stylizedSurface.update(frameTimestamp);
    voxelPrototype.update(canonicalFocus);

    if (frameTimestamp >= nextStreamingStatusAt) {
      ui.renderStreamingStatus(terrainView.getStreamingStatus());
      nextStreamingStatusAt = frameTimestamp + 250;
    }
    terrainView.render(viewModeController.camera);
  });

  window.addEventListener('pagehide', () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    resizeObserver.disconnect();
    voxelPrototypeUi.dispose();
    voxelPrototype.dispose();
    stylizedSurface.dispose();
    assetPipeline.dispose();
    viewModeUi.dispose();
    viewModeController.dispose();
    controller.dispose();
    editorCamera.dispose();
    objectView.dispose();
    frameRateDisplay.dispose();
    terrainView.dispose();
    worldStore.dispose();
  }, { once: true });
}

function showStartupError(error) {
  console.error('Failed to start the SimCity DnD editor.', error);
  document.querySelector('#app').innerHTML = `
    <main style="padding:24px;font-family:system-ui;color:#f4e6e6;background:#211414;min-height:100vh">
      <h1>Editor failed to start</h1>
      <p>${error instanceof Error ? error.message : String(error)}</p>
    </main>
  `;
}

startEditor().catch(showStartupError);
