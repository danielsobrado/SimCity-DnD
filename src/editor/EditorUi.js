import { MINIMAP_SIZE } from './constants.js';
import { exportMap, importMap, loadFromBrowser, saveToBrowser } from './storage.js';
import { TILE_BY_ID, hexToRgbBytes } from './tileCatalog.js';

export class EditorUi {
  constructor({ root, config, tileCatalog, tileMap }) {
    this.root = root;
    this.config = config;
    this.tileCatalog = tileCatalog;
    this.tileMap = tileMap;
    this.controller = null;
    this.toastTimer = null;
    this.minimapQueued = false;

    root.innerHTML = `
      <div class="editor-shell">
        <aside class="sidebar" aria-label="World editor tools">
          <header class="sidebar-header">
            <h1>SimCity DnD</h1>
            <p>Large-map terrain editor</p>
          </header>

          <section class="panel">
            <h2>Terrain tiles</h2>
            <div class="tile-palette" data-role="tile-palette"></div>
          </section>

          <section class="panel">
            <h2>Brush size</h2>
            <div class="brush-row" data-role="brush-row"></div>
          </section>

          <section class="panel">
            <h2>Map actions</h2>
            <div class="action-grid">
              <button class="action-button" type="button" data-action="undo">Undo</button>
              <button class="action-button" type="button" data-action="redo">Redo</button>
              <button class="action-button" type="button" data-action="save">Save</button>
              <button class="action-button" type="button" data-action="load">Load</button>
              <button class="action-button" type="button" data-action="export">Export</button>
              <button class="action-button" type="button" data-action="import">Import</button>
              <button class="action-button" type="button" data-action="new">Clear map</button>
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
              <li><kbd>Left drag</kbd> Paint tiles</li>
              <li><kbd>Space drag</kbd> Pan map</li>
              <li><kbd>Middle drag</kbd> Pan map</li>
              <li><kbd>Right drag</kbd> Rotate view</li>
              <li><kbd>Wheel</kbd> Zoom</li>
              <li><kbd>1–0</kbd> Select terrain</li>
              <li><kbd>[ / ]</kbd> Change brush</li>
            </ul>
          </section>
        </aside>

        <main class="viewport-shell" data-role="viewport">
          <div class="topbar">
            <span>${tileMap.width} × ${tileMap.height} cells</span>
            <span>${config.map.chunkSize} × ${config.map.chunkSize} cell chunks</span>
            <span>Gold lines mark chunk boundaries</span>
          </div>
          <div class="toast" data-role="toast" aria-live="polite"></div>
          <div class="statusbar">
            <span data-role="coordinates">Cell —</span>
            <span data-role="hover-tile">Tile —</span>
            <span data-role="selection">Brush —</span>
          </div>
        </main>
      </div>
    `;

    this.viewport = root.querySelector('[data-role="viewport"]');
    this.palette = root.querySelector('[data-role="tile-palette"]');
    this.brushRow = root.querySelector('[data-role="brush-row"]');
    this.minimap = root.querySelector('[data-role="minimap"]');
    this.toast = root.querySelector('[data-role="toast"]');
    this.coordinates = root.querySelector('[data-role="coordinates"]');
    this.hoverTile = root.querySelector('[data-role="hover-tile"]');
    this.selection = root.querySelector('[data-role="selection"]');
    this.fileInput = root.querySelector('[data-role="file-input"]');

    this.renderTileButtons();
    this.renderBrushButtons();
  }

  bind(controller) {
    this.controller = controller;

    this.palette.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tile-id]');
      if (button) {
        controller.selectTile(Number(button.dataset.tileId));
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
      if (!button) {
        return;
      }
      this.handleAction(button.dataset.action);
    });

    this.fileInput.addEventListener('change', async () => {
      const [file] = this.fileInput.files;
      this.fileInput.value = '';
      if (!file) {
        return;
      }

      try {
        controller.loadDocument(await importMap(file));
        this.showToast('Map imported.');
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

  renderBrushButtons() {
    this.brushRow.innerHTML = this.config.brush.sizes.map((size) => `
      <button class="brush-button" type="button" data-brush-size="${size}">${size}</button>
    `).join('');
  }

  renderState(state) {
    for (const button of this.palette.querySelectorAll('[data-tile-id]')) {
      button.classList.toggle('is-active', Number(button.dataset.tileId) === state.selectedTileId);
    }
    for (const button of this.brushRow.querySelectorAll('[data-brush-size]')) {
      button.classList.toggle('is-active', Number(button.dataset.brushSize) === state.brushSize);
    }

    this.root.querySelector('[data-action="undo"]').disabled = !state.canUndo;
    this.root.querySelector('[data-action="redo"]').disabled = !state.canRedo;

    const tile = TILE_BY_ID.get(state.selectedTileId);
    this.selection.textContent = `${tile.label} · ${state.brushSize} × ${state.brushSize}`;
  }

  renderHover(hover) {
    if (!hover) {
      this.coordinates.textContent = 'Cell —';
      this.hoverTile.textContent = 'Tile —';
      return;
    }
    this.coordinates.textContent = `Cell ${hover.x}, ${hover.z}`;
    this.hoverTile.textContent = hover.tile?.label ?? 'Unknown';
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
        case 'save':
          saveToBrowser(this.config.storage.key, this.tileMap);
          this.showToast('Map saved in this browser.');
          break;
        case 'load': {
          const document = loadFromBrowser(this.config.storage.key);
          if (!document) {
            this.showToast('No browser save exists yet.');
            return;
          }
          this.controller.loadDocument(document);
          this.showToast('Browser save loaded.');
          break;
        }
        case 'export':
          exportMap(this.tileMap);
          this.showToast('Map exported as JSON.');
          break;
        case 'import':
          this.fileInput.click();
          break;
        case 'new':
          if (window.confirm('Clear the complete map to plains?')) {
            this.controller.fill(0);
            this.showToast('Map cleared to plains.');
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
      const offset = index * 4;
      image.data[offset] = red;
      image.data[offset + 1] = green;
      image.data[offset + 2] = blue;
      image.data[offset + 3] = 255;
    }

    const buffer = document.createElement('canvas');
    buffer.width = this.tileMap.width;
    buffer.height = this.tileMap.height;
    buffer.getContext('2d').putImageData(image, 0, 0);

    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, this.minimap.width, this.minimap.height);
    context.drawImage(buffer, 0, 0, this.minimap.width, this.minimap.height);
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
