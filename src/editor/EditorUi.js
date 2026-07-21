import { MINIMAP_SIZE } from './constants.js';
import { exportMap, importMap, loadFromBrowser, saveToBrowser } from './storage.js';
import { TILE_BY_ID, hexToRgbBytes } from './tileCatalog.js';

const TERRAIN_MODE_LABELS = Object.freeze({
  paint: 'Paint',
  raise: 'Raise',
  lower: 'Lower',
  smooth: 'Smooth',
});
const MINIMAP_HEIGHT_SHADE = 0.025;
const MINIMAP_MINIMUM_SHADE = 0.55;
const MINIMAP_MAXIMUM_SHADE = 1.25;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export class EditorUi {
  constructor({ root, config, tileCatalog, tileMap, heightField, objectCatalog, objectMap }) {
    this.root = root;
    this.config = config;
    this.tileCatalog = tileCatalog;
    this.tileMap = tileMap;
    this.heightField = heightField;
    this.objectCatalog = objectCatalog;
    this.objectMap = objectMap;
    this.objectByKey = new Map(objectCatalog.map((definition) => [definition.key, definition]));
    this.controller = null;
    this.toastTimer = null;
    this.minimapQueued = false;

    root.innerHTML = `
      <div class="editor-shell">
        <aside class="sidebar" aria-label="World editor tools">
          <header class="sidebar-header">
            <h1>SimCity DnD</h1>
            <p>Terrain and settlement editor</p>
          </header>

          <section class="panel">
            <h2>Editor mode</h2>
            <div class="tool-row" data-role="tool-row">
              <button class="tool-button" type="button" data-tool="terrain">Terrain</button>
              <button class="tool-button" type="button" data-tool="object">Objects</button>
              <button class="tool-button" type="button" data-tool="select">Select</button>
            </div>
          </section>

          <section class="panel tool-panel" data-panel="terrain">
            <h2>Terrain operation</h2>
            <div class="terrain-mode-row" data-role="terrain-mode-row">
              <button class="tool-button" type="button" data-terrain-mode="paint">Paint</button>
              <button class="tool-button" type="button" data-terrain-mode="raise">Raise</button>
              <button class="tool-button" type="button" data-terrain-mode="lower">Lower</button>
              <button class="tool-button" type="button" data-terrain-mode="smooth">Smooth</button>
            </div>
            <div data-role="tile-tools">
              <h2 class="panel-subheading">Terrain tiles</h2>
              <div class="tile-palette" data-role="tile-palette"></div>
            </div>
            <h2 class="panel-subheading">Brush size</h2>
            <div class="brush-row" data-role="brush-row"></div>
            <p class="panel-note">Sculpt strength ${config.terrain.sculptStrength}</p>
          </section>

          <section class="panel tool-panel" data-panel="object" hidden>
            <h2>Place objects</h2>
            <div class="object-palette" data-role="object-palette"></div>
            <button class="action-button action-button--wide" type="button" data-action="rotate-placement">
              Rotate preview <kbd>R</kbd>
            </button>
            <p class="panel-note" data-role="placement-info">Rotation 0°</p>
          </section>

          <section class="panel tool-panel" data-panel="select" hidden>
            <h2>Selected object</h2>
            <div class="selection-card" data-role="selected-object">Click a placed object.</div>
            <div class="action-grid">
              <button class="action-button" type="button" data-action="move-selected">Move</button>
              <button class="action-button" type="button" data-action="rotate-selected">Rotate</button>
              <button class="action-button action-button--danger" type="button" data-action="delete-selected">Delete</button>
            </div>
          </section>

          <section class="panel">
            <h2>World actions</h2>
            <div class="action-grid">
              <button class="action-button" type="button" data-action="undo">Undo</button>
              <button class="action-button" type="button" data-action="redo">Redo</button>
              <button class="action-button" type="button" data-action="save">Save</button>
              <button class="action-button" type="button" data-action="load">Load</button>
              <button class="action-button" type="button" data-action="export">Export</button>
              <button class="action-button" type="button" data-action="import">Import</button>
              <button class="action-button" type="button" data-action="new">Clear world</button>
              <button class="action-button" type="button" data-action="camera">Reset view</button>
            </div>
            <input data-role="file-input" type="file" accept="application/json,.json" hidden />
          </section>

          <section class="panel">
            <h2>World overview</h2>
            <div class="minimap-frame">
              <canvas data-role="minimap" width="${MINIMAP_SIZE}" height="${MINIMAP_SIZE}"></canvas>
            </div>
          </section>

          <section class="panel">
            <h2>Controls</h2>
            <ul class="help-list">
              <li><kbd>T / O / V</kbd> Terrain, objects, select</li>
              <li><kbd>P / U</kbd> Paint or raise terrain</li>
              <li><kbd>J / K</kbd> Lower or smooth terrain</li>
              <li><kbd>Left drag</kbd> Apply terrain brush</li>
              <li><kbd>Left click</kbd> Place or select object</li>
              <li><kbd>R</kbd> Rotate preview or selection</li>
              <li><kbd>Delete</kbd> Remove selected object</li>
              <li><kbd>Space drag</kbd> Pan map</li>
              <li><kbd>Right drag</kbd> Rotate view</li>
              <li><kbd>Wheel</kbd> Zoom</li>
              <li><kbd>1–0</kbd> Select terrain tile</li>
            </ul>
          </section>
        </aside>

        <main class="viewport-shell" data-role="viewport">
          <div class="topbar">
            <span>${tileMap.width} × ${tileMap.height} cells</span>
            <span>${config.map.chunkSize} × ${config.map.chunkSize} cell chunks</span>
            <span data-role="object-count">0 objects</span>
          </div>
          <div class="toast" data-role="toast" aria-live="polite"></div>
          <div class="statusbar">
            <span data-role="coordinates">Cell —</span>
            <span data-role="hover-height">Height —</span>
            <span data-role="hover-tile">Tile —</span>
            <span data-role="hover-object">Object —</span>
            <span data-role="selection">Terrain —</span>
          </div>
        </main>
      </div>
    `;

    this.viewport = root.querySelector('[data-role="viewport"]');
    this.toolRow = root.querySelector('[data-role="tool-row"]');
    this.terrainModeRow = root.querySelector('[data-role="terrain-mode-row"]');
    this.tileTools = root.querySelector('[data-role="tile-tools"]');
    this.palette = root.querySelector('[data-role="tile-palette"]');
    this.objectPalette = root.querySelector('[data-role="object-palette"]');
    this.brushRow = root.querySelector('[data-role="brush-row"]');
    this.minimap = root.querySelector('[data-role="minimap"]');
    this.toast = root.querySelector('[data-role="toast"]');
    this.coordinates = root.querySelector('[data-role="coordinates"]');
    this.hoverHeight = root.querySelector('[data-role="hover-height"]');
    this.hoverTile = root.querySelector('[data-role="hover-tile"]');
    this.hoverObject = root.querySelector('[data-role="hover-object"]');
    this.selection = root.querySelector('[data-role="selection"]');
    this.objectCount = root.querySelector('[data-role="object-count"]');
    this.selectedObject = root.querySelector('[data-role="selected-object"]');
    this.placementInfo = root.querySelector('[data-role="placement-info"]');
    this.fileInput = root.querySelector('[data-role="file-input"]');

    this.renderTileButtons();
    this.renderObjectButtons();
    this.renderBrushButtons();
  }

  bind(controller) {
    this.controller = controller;

    this.toolRow.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tool]');
      if (button) {
        controller.selectTool(button.dataset.tool);
      }
    });

    this.terrainModeRow.addEventListener('click', (event) => {
      const button = event.target.closest('[data-terrain-mode]');
      if (button) {
        controller.selectTerrainMode(button.dataset.terrainMode);
      }
    });

    this.palette.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tile-id]');
      if (button) {
        controller.selectTile(Number(button.dataset.tileId));
      }
    });

    this.objectPalette.addEventListener('click', (event) => {
      const button = event.target.closest('[data-object-key]');
      if (button) {
        controller.selectObjectDefinition(button.dataset.objectKey);
      }
    });

    this.brushRow.addEventListener('click', (event) => {
      const button = event.target.closest('[data-brush-size]');
      if (button) {
        controller.selectBrush(Number(button.dataset.brushSize));
      }
    });

    this.root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (button) {
        this.handleAction(button.dataset.action);
      }
    });

    this.fileInput.addEventListener('change', async () => {
      const [file] = this.fileInput.files;
      this.fileInput.value = '';
      if (!file) {
        return;
      }

      try {
        controller.loadDocument(await importMap(file));
        this.showToast('World imported.');
      } catch (error) {
        this.showToast(error.message, true);
      }
    });

    this.minimap.addEventListener('click', (event) => {
      const bounds = this.minimap.getBoundingClientRect();
      const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * this.tileMap.width);
      const z = Math.floor(((event.clientY - bounds.top) / bounds.height) * this.tileMap.height);
      controller.focusCell(
        Math.max(0, Math.min(this.tileMap.width - 1, x)),
        Math.max(0, Math.min(this.tileMap.height - 1, z)),
      );
    });

    controller.subscribe((state) => this.renderState(state));
    controller.subscribeHover((hover) => this.renderHover(hover));
    controller.subscribeNotice(({ message, isError }) => this.showToast(message, isError));
    controller.subscribeMap(({ final }) => {
      if (final) {
        this.queueMinimapUpdate();
      }
    });

    this.updateMinimap();
  }

  renderTileButtons() {
    this.palette.innerHTML = this.tileCatalog.map((tile) => `
      <button class="tile-button" type="button" data-tile-id="${tile.id}" title="${tile.label}">
        <span class="tile-button__swatch" style="background:${tile.color}"></span>
        <span class="tile-button__label">${tile.icon} ${tile.label}</span>
        <span class="tile-button__shortcut">${tile.shortcut}</span>
      </button>
    `).join('');
  }

  renderObjectButtons() {
    this.objectPalette.innerHTML = this.objectCatalog.map((definition) => `
      <button class="object-button" type="button" data-object-key="${definition.key}" title="${definition.label}">
        <span class="object-button__swatch" style="background:${definition.color}">${definition.icon}</span>
        <span class="object-button__label">${definition.label}</span>
        <span class="object-button__footprint">${definition.footprint.width}×${definition.footprint.depth}</span>
      </button>
    `).join('');
  }

  renderBrushButtons() {
    this.brushRow.innerHTML = this.config.brush.sizes.map((size) => `
      <button class="brush-button" type="button" data-brush-size="${size}">${size}</button>
    `).join('');
  }

  renderState(state) {
    for (const button of this.toolRow.querySelectorAll('[data-tool]')) {
      button.classList.toggle('is-active', button.dataset.tool === state.tool);
    }
    for (const panel of this.root.querySelectorAll('[data-panel]')) {
      panel.hidden = panel.dataset.panel !== state.tool;
    }
    for (const button of this.terrainModeRow.querySelectorAll('[data-terrain-mode]')) {
      button.classList.toggle('is-active', button.dataset.terrainMode === state.terrainMode);
    }
    this.tileTools.hidden = state.terrainMode !== 'paint';
    for (const button of this.palette.querySelectorAll('[data-tile-id]')) {
      button.classList.toggle('is-active', Number(button.dataset.tileId) === state.selectedTileId);
    }
    for (const button of this.objectPalette.querySelectorAll('[data-object-key]')) {
      button.classList.toggle('is-active', button.dataset.objectKey === state.selectedObjectKey);
    }
    for (const button of this.brushRow.querySelectorAll('[data-brush-size]')) {
      button.classList.toggle('is-active', Number(button.dataset.brushSize) === state.brushSize);
    }

    this.root.querySelector('[data-action="undo"]').disabled = !state.canUndo;
    this.root.querySelector('[data-action="redo"]').disabled = !state.canRedo;
    this.root.querySelector('[data-action="move-selected"]').disabled = !state.selectedObject;
    this.root.querySelector('[data-action="rotate-selected"]').disabled = !state.selectedObject;
    this.root.querySelector('[data-action="delete-selected"]').disabled = !state.selectedObject;

    this.objectCount.textContent = `${state.objectCount} object${state.objectCount === 1 ? '' : 's'}`;
    const tile = TILE_BY_ID.get(state.selectedTileId);
    const objectDefinition = this.objectByKey.get(state.selectedObjectKey);
    const rotatedFootprint = state.objectRotation % 2 === 0
      ? objectDefinition.footprint
      : { width: objectDefinition.footprint.depth, depth: objectDefinition.footprint.width };
    this.placementInfo.textContent = `${objectDefinition.label} · ${state.objectRotation * 90}° · ${rotatedFootprint.width}×${rotatedFootprint.depth}`;

    if (state.tool === 'terrain') {
      const modeLabel = TERRAIN_MODE_LABELS[state.terrainMode];
      this.selection.textContent = state.terrainMode === 'paint'
        ? `${modeLabel} ${tile.label} · ${state.brushSize} × ${state.brushSize}`
        : `${modeLabel} · ${state.brushSize} × ${state.brushSize}`;
    } else if (state.tool === 'object') {
      this.selection.textContent = `${objectDefinition.label} · ${state.objectRotation * 90}°`;
    } else {
      this.selection.textContent = state.selectedObject
        ? `${state.isMovingSelected ? 'Move' : 'Selected'} #${state.selectedObject.id}`
        : 'Select an object';
    }

    if (!state.selectedObject) {
      this.selectedObject.textContent = 'Click a placed object.';
      return;
    }
    const selectedDefinition = this.objectByKey.get(state.selectedObject.definitionKey);
    this.selectedObject.innerHTML = `
      <strong>${selectedDefinition.icon} ${selectedDefinition.label}</strong>
      <span>ID ${state.selectedObject.id}</span>
      <span>Cell ${state.selectedObject.x}, ${state.selectedObject.z}</span>
      <span>Rotation ${state.selectedObject.rotation * 90}°</span>
      ${state.isMovingSelected ? '<span>Click a valid destination cell.</span>' : ''}
    `;
  }

  renderHover(hover) {
    if (!hover) {
      this.coordinates.textContent = 'Cell —';
      this.hoverHeight.textContent = 'Height —';
      this.hoverTile.textContent = 'Tile —';
      this.hoverObject.textContent = 'Object —';
      return;
    }
    this.coordinates.textContent = `Cell ${hover.x}, ${hover.z}`;
    this.hoverHeight.textContent = `Height ${hover.height.toFixed(2)}`;
    this.hoverTile.textContent = hover.tile?.label ?? 'Unknown';
    this.hoverObject.textContent = hover.objectDefinition?.label ?? 'Object —';
  }

  async handleAction(action) {
    try {
      switch (action) {
        case 'undo':
          this.controller.undo();
          break;
        case 'redo':
          this.controller.redo();
          break;
        case 'rotate-placement':
          this.controller.rotatePlacement();
          break;
        case 'move-selected':
          this.controller.startMoveSelected();
          break;
        case 'rotate-selected':
          this.controller.rotateSelected();
          break;
        case 'delete-selected':
          this.controller.deleteSelected();
          break;
        case 'save':
          saveToBrowser(this.config.storage.key, this.controller.toDocument());
          this.showToast('World saved in this browser.');
          break;
        case 'load': {
          const worldDocument = loadFromBrowser(this.config.storage.key);
          if (!worldDocument) {
            this.showToast('No browser save exists yet.');
            return;
          }
          this.controller.loadDocument(worldDocument);
          this.showToast('Browser save loaded.');
          break;
        }
        case 'export':
          exportMap(this.controller.toDocument());
          this.showToast('World exported as JSON.');
          break;
        case 'import':
          this.fileInput.click();
          break;
        case 'new':
          if (window.confirm('Clear all terrain edits and placed objects?')) {
            this.controller.clearWorld();
            this.showToast('World cleared.');
          }
          break;
        case 'camera':
          this.controller.resetCamera();
          break;
        default:
          break;
      }
    } catch (error) {
      this.showToast(error.message, true);
    }
  }

  queueMinimapUpdate() {
    if (this.minimapQueued) {
      return;
    }
    this.minimapQueued = true;
    requestAnimationFrame(() => {
      this.minimapQueued = false;
      this.updateMinimap();
    });
  }

  updateMinimap() {
    const context = this.minimap.getContext('2d', { alpha: false });
    const image = context.createImageData(this.tileMap.width, this.tileMap.height);

    for (let index = 0; index < this.tileMap.tileCount; index += 1) {
      const tile = TILE_BY_ID.get(this.tileMap.tiles[index]);
      const [red, green, blue] = hexToRgbBytes(tile.color);
      const { x, z } = this.tileMap.coordinatesOf(index);
      const height = this.heightField.getCellHeight(x, z) ?? 0;
      const shade = clamp(
        1 + height * MINIMAP_HEIGHT_SHADE,
        MINIMAP_MINIMUM_SHADE,
        MINIMAP_MAXIMUM_SHADE,
      );
      const offset = index * 4;
      image.data[offset] = clamp(Math.round(red * shade), 0, 255);
      image.data[offset + 1] = clamp(Math.round(green * shade), 0, 255);
      image.data[offset + 2] = clamp(Math.round(blue * shade), 0, 255);
      image.data[offset + 3] = 255;
    }

    const buffer = window.document.createElement('canvas');
    buffer.width = this.tileMap.width;
    buffer.height = this.tileMap.height;
    buffer.getContext('2d').putImageData(image, 0, 0);

    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, this.minimap.width, this.minimap.height);
    context.drawImage(buffer, 0, 0, this.minimap.width, this.minimap.height);

    const scaleX = this.minimap.width / this.tileMap.width;
    const scaleZ = this.minimap.height / this.tileMap.height;
    for (const object of this.objectMap.list()) {
      const definition = this.objectByKey.get(object.definitionKey);
      context.fillStyle = definition.color;
      context.fillRect(
        Math.floor(object.x * scaleX) - 1,
        Math.floor(object.z * scaleZ) - 1,
        Math.max(2, Math.ceil(definition.footprint.width * scaleX)),
        Math.max(2, Math.ceil(definition.footprint.depth * scaleZ)),
      );
    }
  }

  showToast(message, isError = false) {
    window.clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.style.borderColor = isError ? '#a95a5a' : '';
    this.toast.classList.add('is-visible');
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove('is-visible');
    }, 2600);
  }
}
