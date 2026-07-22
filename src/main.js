import './styles.css';
import { loadEditorConfig } from './config/loadEditorConfig.js';
import { installObjectAssets } from './editor/assets/installObjectAssets.js';
import { EditorCamera } from './editor/EditorCamera.js';
import { EditorUi } from './editor/EditorUi.js';
import { HeightField } from './editor/HeightField.js';
import { ObjectMap } from './editor/ObjectMap.js';
import { ObjectView } from './editor/ObjectView.js';
import { OBJECT_CATALOG } from './editor/objectCatalog.js';
import { OBJECT_RENDER_CATALOG } from './editor/objectRenderCatalog.js';
import { TerrainAwareEditorController } from './editor/TerrainAwareEditorController.js';
import { TerrainView } from './editor/TerrainView.js';
import { TileMap } from './editor/TileMap.js';
import { TILE_BY_KEY, TILE_CATALOG } from './editor/tileCatalog.js';
import { GpuVoxelWorld } from './editor/voxel/GpuVoxelWorld.js';
import { VoxelPrototypeUi } from './editor/voxel/VoxelPrototypeUi.js';
import { VoxelStampStore } from './editor/voxel/VoxelStampStore.js';
import { createVoxelWorldLayout } from './editor/voxel/VoxelWorldLayout.js';

async function startEditor() {
  const config = loadEditorConfig();
  const defaultTile = TILE_BY_KEY.get(config.map.defaultTile);
  if (!defaultTile) {
    throw new Error(`Unknown default tile: ${config.map.defaultTile}.`);
  }

  const root = document.querySelector('#app');
  const tileMap = new TileMap({
    width: config.map.width,
    height: config.map.height,
    tileSize: config.map.tileSize,
    defaultTileId: defaultTile.id,
  });
  const heightField = new HeightField({
    width: config.map.width,
    height: config.map.height,
  });
  const objectMap = new ObjectMap({ tileMap, objectCatalog: OBJECT_CATALOG });
  const voxelWorldLayout = createVoxelWorldLayout(config.voxelPrototype, config.map);
  const voxelStampStore = new VoxelStampStore({
    cells: [
      voxelWorldLayout.totalCellsX,
      voxelWorldLayout.totalCellsY,
      voxelWorldLayout.totalCellsZ,
    ],
    legacyCells: config.voxelPrototype.cells,
    maxStamps: config.voxelPrototype.maxStamps,
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

  const terrainView = new TerrainView({
    container: ui.viewport,
    tileMap,
    heightField,
    chunkSize: config.map.chunkSize,
    rendererConfig: config.renderer,
  });

  try {
    await terrainView.initialize();
  } catch (error) {
    terrainView.dispose();
    throw error;
  }

  const objectView = new ObjectView({
    terrainView,
    tileMap,
    heightField,
    objectMap,
    objectCatalog: OBJECT_CATALOG,
  });

  const editorCamera = new EditorCamera({
    canvas: terrainView.renderer.domElement,
    viewSize: config.camera.viewSize,
    minZoom: config.camera.minZoom,
    maxZoom: config.camera.maxZoom,
    damping: config.camera.damping,
  });

  const controller = new TerrainAwareEditorController({
    tileMap,
    heightField,
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

  ui.bind(controller);
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
  const voxelStatus = await voxelPrototype.initialize();
  voxelPrototypeUi.render();
  if (voxelStatus.code === 'failed') {
    console.error('GPU voxel world failed to initialize.', voxelStatus.error);
  }

  const resizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    terrainView.resize(width, height);
    editorCamera.resize(width, height);
  });
  resizeObserver.observe(ui.viewport);

  let active = true;
  terrainView.setAnimationLoop(() => {
    if (!active) {
      return;
    }
    editorCamera.update();
    voxelPrototype.update();
    terrainView.render(editorCamera.camera);
  });

  window.addEventListener('pagehide', () => {
    active = false;
    resizeObserver.disconnect();
    voxelPrototypeUi.dispose();
    voxelPrototype.dispose();
    assetPipeline.dispose();
    controller.dispose();
    editorCamera.dispose();
    objectView.dispose();
    terrainView.dispose();
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
