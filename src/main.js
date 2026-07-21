import './styles.css';
import { loadEditorConfig } from './config/loadEditorConfig.js';
import { installObjectAssets } from './editor/assets/installObjectAssets.js';
import { EditorCamera } from './editor/EditorCamera.js';
import { EditorController } from './editor/EditorController.js';
import { EditorUi } from './editor/EditorUi.js';
import { ObjectMap } from './editor/ObjectMap.js';
import { ObjectView } from './editor/ObjectView.js';
import { OBJECT_CATALOG } from './editor/objectCatalog.js';
import { OBJECT_RENDER_CATALOG } from './editor/objectRenderCatalog.js';
import { TerrainView } from './editor/TerrainView.js';
import { TileMap } from './editor/TileMap.js';
import { TILE_BY_KEY, TILE_CATALOG } from './editor/tileCatalog.js';

function startEditor() {
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
  const objectMap = new ObjectMap({ tileMap, objectCatalog: OBJECT_CATALOG });

  const ui = new EditorUi({
    root,
    config,
    tileCatalog: TILE_CATALOG,
    tileMap,
    objectCatalog: OBJECT_CATALOG,
    objectMap,
  });

  const terrainView = new TerrainView({
    container: ui.viewport,
    tileMap,
    chunkSize: config.map.chunkSize,
  });
  const objectView = new ObjectView({
    terrainView,
    tileMap,
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

  const controller = new EditorController({
    tileMap,
    objectMap,
    terrainView,
    objectView,
    editorCamera,
    objectCatalog: OBJECT_CATALOG,
    brushSizes: config.brush.sizes,
    defaultBrushSize: config.brush.defaultSize,
  });

  ui.bind(controller);
  const assetPipeline = installObjectAssets({
    objectView,
    catalog: OBJECT_RENDER_CATALOG,
    tileSize: tileMap.tileSize,
    ui,
    baseUrl: import.meta.env.BASE_URL,
  });

  const resizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    terrainView.resize(width, height);
    editorCamera.resize(width, height);
  });
  resizeObserver.observe(ui.viewport);

  let active = true;
  function render() {
    if (!active) {
      return;
    }
    editorCamera.update();
    terrainView.render(editorCamera.camera);
    requestAnimationFrame(render);
  }
  render();

  window.addEventListener('pagehide', () => {
    active = false;
    resizeObserver.disconnect();
    assetPipeline.dispose();
    controller.dispose();
    editorCamera.dispose();
    objectView.dispose();
    terrainView.dispose();
  }, { once: true });
}

try {
  startEditor();
} catch (error) {
  console.error('Failed to start the SimCity DnD editor.', error);
  document.querySelector('#app').innerHTML = `
    <main style="padding:24px;font-family:system-ui;color:#f4e6e6;background:#211414;min-height:100vh">
      <h1>Editor failed to start</h1>
      <p>${error.message}</p>
    </main>
  `;
}
