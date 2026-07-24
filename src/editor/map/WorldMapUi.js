import { decodeAzgaarCartographySource } from '../import/AzgaarCartographySource.js';
import { decodeMacroAtlas } from '../import/AzgaarMacroWorldSource.js';
import { hexToRgbBytes } from '../tileCatalog.js';
import {
  burgToNormalized,
  canonicalWorldToNormalized,
  normalizedToCanonicalWorld,
} from './worldMapCoordinates.js';
import {
  DEFAULT_WORLD_MAP_PRESET,
  WORLD_MAP_LAYER_TOGGLES,
  WORLD_MAP_PRESETS,
  createVectorMapModel,
  createVectorView,
  findVectorMapCell,
  getVectorCellDetails,
  panVectorView,
  presetLayerDefaults,
  resizeVectorView,
  screenToVectorSource,
  vectorSemanticVisibility,
  vectorViewBox,
  zoomVectorView,
} from './worldMapVector.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const LEGACY_MAX_ZOOM_FACTOR = 24;
const DRAG_THRESHOLD_PX = 4;
const HOVER_RADIUS_PX = 12;
const OCEAN_DEEP = [32, 52, 92];
const OCEAN_SHALLOW = [86, 122, 168];
const LAND_HEIGHT_THRESHOLD = 20;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(left, right, amount) {
  return left + (right - left) * amount;
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function safeClassName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function finitePoint(record) {
  return Number.isFinite(Number(record?.x)) && Number.isFinite(Number(record?.y));
}

function routeClass(group) {
  if (group.includes('sea')) return 'world-map-route-sea';
  if (group.includes('trail')) return 'world-map-route-trail';
  return 'world-map-route-road';
}

export class WorldMapUi {
  constructor({ root, controller }) {
    this.root = root;
    this.controller = controller;
    this.preset = DEFAULT_WORLD_MAP_PRESET;
    this.layers = presetLayerDefaults(this.preset);

    const presetOptions = WORLD_MAP_PRESETS
      .map(({ id, label }) => `<option value="${id}">${label}</option>`)
      .join('');
    const layerControls = WORLD_MAP_LAYER_TOGGLES
      .map(({ id, label }) => `
        <label class="world-map-layer-toggle">
          <input type="checkbox" data-layer="${id}">
          <span>${label}</span>
        </label>
      `)
      .join('');

    this.overlay = document.createElement('div');
    this.overlay.className = 'world-map-overlay';
    this.overlay.hidden = true;
    this.overlay.innerHTML = `
      <div class="world-map-panel">
        <div class="world-map-header">
          <h2>World Map</h2>
          <div class="world-map-hint" data-role="world-map-hint">
            Click to travel · drag to pan · scroll to zoom · Esc to close
          </div>
          <button type="button" class="world-map-close" data-role="world-map-close" aria-label="Close world map">✕</button>
        </div>
        <div class="world-map-toolbar" data-role="world-map-toolbar" hidden>
          <label class="world-map-preset">
            <span>View</span>
            <select data-role="world-map-preset">${presetOptions}</select>
          </label>
          <div class="world-map-layer-controls">${layerControls}</div>
          <div class="world-map-zoom-controls">
            <button type="button" data-role="world-map-zoom-out" aria-label="Zoom out">−</button>
            <output data-role="world-map-zoom-level">1×</output>
            <button type="button" data-role="world-map-zoom-in" aria-label="Zoom in">+</button>
            <button type="button" data-role="world-map-zoom-reset">Fit</button>
          </div>
        </div>
        <div class="world-map-body" data-role="world-map-body">
          <svg class="world-map-vector" data-role="world-map-vector" aria-label="Detailed world map" hidden></svg>
          <canvas class="world-map-canvas" data-role="world-map-canvas"></canvas>
          <div class="world-map-empty" data-role="world-map-empty" hidden>
            Import an Azgaar map to use the world map.
          </div>
          <div class="world-map-legacy-notice" data-role="world-map-legacy-notice" hidden></div>
          <div class="world-map-tooltip" data-role="world-map-tooltip" hidden></div>
        </div>
      </div>
    `;
    root.append(this.overlay);

    this.body = this.overlay.querySelector('[data-role="world-map-body"]');
    this.canvas = this.overlay.querySelector('[data-role="world-map-canvas"]');
    this.svg = this.overlay.querySelector('[data-role="world-map-vector"]');
    this.emptyState = this.overlay.querySelector('[data-role="world-map-empty"]');
    this.legacyNotice = this.overlay.querySelector('[data-role="world-map-legacy-notice"]');
    this.tooltip = this.overlay.querySelector('[data-role="world-map-tooltip"]');
    this.closeButton = this.overlay.querySelector('[data-role="world-map-close"]');
    this.hint = this.overlay.querySelector('[data-role="world-map-hint"]');
    this.toolbar = this.overlay.querySelector('[data-role="world-map-toolbar"]');
    this.presetSelect = this.overlay.querySelector('[data-role="world-map-preset"]');
    this.zoomLevel = this.overlay.querySelector('[data-role="world-map-zoom-level"]');
    this.zoomInButton = this.overlay.querySelector('[data-role="world-map-zoom-in"]');
    this.zoomOutButton = this.overlay.querySelector('[data-role="world-map-zoom-out"]');
    this.zoomResetButton = this.overlay.querySelector('[data-role="world-map-zoom-reset"]');
    this.layerInputs = new Map(
      [...this.overlay.querySelectorAll('[data-layer]')]
        .map((input) => [input.dataset.layer, input]),
    );
    this.context = this.canvas.getContext('2d', { alpha: false });

    this.mapSourceRef = null;
    this.atlasCanvas = null;
    this.atlasSourceRef = null;
    this.vectorModel = null;
    this.vectorScene = null;
    this.vectorView = null;
    this.mode = null;
    this.legacyView = null;
    this.pointer = null;
    this.wasOpen = false;
    this.resizeObserved = false;
    this.drawQueued = false;

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.onClose = () => controller.close();
    this.closeButton.addEventListener('click', this.onClose);
    this.onOverlayClick = (event) => {
      if (event.target === this.overlay) controller.close();
    };
    this.overlay.addEventListener('click', this.onOverlayClick);

    this.onWheel = (event) => this.handleWheel(event);
    this.onPointerDown = (event) => this.handlePointerDown(event);
    this.onPointerMove = (event) => this.handlePointerMove(event);
    this.onPointerUp = (event) => this.handlePointerUp(event);
    for (const surface of [this.canvas, this.svg]) {
      surface.addEventListener('wheel', this.onWheel, { passive: false });
      surface.addEventListener('pointerdown', this.onPointerDown);
      surface.addEventListener('pointermove', this.onPointerMove);
      surface.addEventListener('pointerup', this.onPointerUp);
      surface.addEventListener('pointercancel', this.onPointerUp);
      surface.addEventListener('pointerleave', () => {
        if (!this.pointer) this.tooltip.hidden = true;
      });
    }

    this.onPresetChange = () => this.setPreset(this.presetSelect.value);
    this.presetSelect.addEventListener('change', this.onPresetChange);
    this.onLayerChange = (event) => {
      const id = event.currentTarget.dataset.layer;
      this.layers[id] = event.currentTarget.checked;
      this.applyVectorLayerVisibility();
    };
    for (const input of this.layerInputs.values()) {
      input.addEventListener('change', this.onLayerChange);
    }

    this.onZoomIn = () => this.zoomAtCenter(1.6);
    this.onZoomOut = () => this.zoomAtCenter(1 / 1.6);
    this.onZoomReset = () => {
      this.resetVectorView();
      this.applyVectorView();
    };
    this.zoomInButton.addEventListener('click', this.onZoomIn);
    this.zoomOutButton.addEventListener('click', this.onZoomOut);
    this.zoomResetButton.addEventListener('click', this.onZoomReset);
    this.syncLayerControls();

    this.unsubscribe = controller.subscribe((state) => this.render(state));
  }

  render(state) {
    const opening = state.isOpen && !this.wasOpen;
    this.wasOpen = state.isOpen;
    this.overlay.hidden = !state.isOpen;
    this.tooltip.hidden = true;
    if (!state.isOpen) return;

    if (!state.available) {
      this.showEmptyState();
      return;
    }

    this.emptyState.hidden = true;
    if (!this.resizeObserved) {
      this.resizeObserved = true;
      this.resizeObserver.observe(this.body);
    }
    this.ensureMapData();

    if (this.mode === 'vector') {
      this.showVectorMap();
      if (!this.vectorView) this.resetVectorView();
      if (!this.vectorScene) this.buildVectorScene();
      this.updateVectorPlayerMarker();
      this.applyVectorView();
    } else {
      this.showLegacyMap();
      if (!this.legacyView) this.resetLegacyView();
      if (opening) this.drawLegacy();
    }
  }

  showEmptyState() {
    this.emptyState.hidden = false;
    this.canvas.hidden = true;
    this.svg.toggleAttribute('hidden', true);
    this.toolbar.hidden = true;
    this.legacyNotice.hidden = true;
  }

  showVectorMap() {
    this.canvas.hidden = true;
    this.svg.toggleAttribute('hidden', false);
    this.toolbar.hidden = false;
    this.legacyNotice.hidden = true;
    this.hint.textContent = 'Click to travel · drag to pan · scroll to zoom · hover for details · Esc to close';
  }

  showLegacyMap() {
    this.canvas.hidden = false;
    this.svg.toggleAttribute('hidden', true);
    this.toolbar.hidden = true;
    this.legacyNotice.hidden = false;
    this.hint.textContent = 'Click to travel · drag to pan · scroll to zoom · Esc to close';
  }

  resetMapData() {
    this.atlasCanvas = null;
    this.atlasSourceRef = null;
    this.vectorModel = null;
    this.vectorScene = null;
    this.vectorView = null;
    this.legacyView = null;
    this.mode = null;
    this.svg.replaceChildren();
    this.preset = DEFAULT_WORLD_MAP_PRESET;
    this.layers = presetLayerDefaults(this.preset);
    this.presetSelect.value = this.preset;
    this.syncLayerControls();
  }

  ensureMapData() {
    const campaign = this.controller.getCampaignData();
    if (campaign === this.mapSourceRef && this.mode) return;
    this.mapSourceRef = campaign;
    this.resetMapData();

    if (campaign?.cartography) {
      try {
        const cartography = decodeAzgaarCartographySource(campaign.cartography);
        this.vectorModel = createVectorMapModel(
          cartography,
          campaign,
          this.controller.getBaseTerrain(),
        );
        this.mode = 'vector';
        return;
      } catch (error) {
        console.warn('Unable to decode detailed Azgaar cartography; using raster fallback.', error);
        this.legacyNotice.textContent = 'Detailed map data is damaged. Showing the legacy map instead; re-import the Azgaar Full JSON to repair it.';
      }
    } else {
      this.legacyNotice.textContent = 'Legacy map preview. Re-import the Azgaar Full JSON once to unlock crisp vector zoom and map views.';
    }
    this.mode = 'legacy';
    this.ensureAtlas();
  }

  ensureAtlas() {
    const baseTerrain = this.controller.getBaseTerrain();
    if (this.atlasSourceRef === baseTerrain && this.atlasCanvas) return;
    this.atlasSourceRef = baseTerrain;
    if (!baseTerrain) {
      this.atlasCanvas = null;
      return;
    }

    const { heights, biomes } = decodeMacroAtlas(baseTerrain);
    const { width, height } = baseTerrain.atlas;
    const colorBySourceId = new Map(
      baseTerrain.biomes.map((definition) => [definition.sourceId, hexToRgbBytes(definition.color)]),
    );
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = width;
    atlasCanvas.height = height;
    const ctx = atlasCanvas.getContext('2d', { alpha: false });
    const image = ctx.createImageData(width, height);

    for (let index = 0; index < width * height; index += 1) {
      const sourceId = biomes[index];
      const [baseRed, baseGreen, baseBlue] = colorBySourceId.get(sourceId) ?? [90, 90, 90];
      let red;
      let green;
      let blue;
      if (sourceId === 0) {
        const depth = clamp(heights[index] / LAND_HEIGHT_THRESHOLD, 0, 1);
        red = lerp(OCEAN_DEEP[0], OCEAN_SHALLOW[0], depth);
        green = lerp(OCEAN_DEEP[1], OCEAN_SHALLOW[1], depth);
        blue = lerp(OCEAN_DEEP[2], OCEAN_SHALLOW[2], depth);
      } else {
        const shade = clamp(0.78 + (heights[index] - LAND_HEIGHT_THRESHOLD) / 220, 0.72, 1.2);
        red = baseRed * shade;
        green = baseGreen * shade;
        blue = baseBlue * shade;
      }
      const offset = index * 4;
      image.data[offset] = clamp(Math.round(red), 0, 255);
      image.data[offset + 1] = clamp(Math.round(green), 0, 255);
      image.data[offset + 2] = clamp(Math.round(blue), 0, 255);
      image.data[offset + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    this.atlasCanvas = atlasCanvas;
  }

  buildVectorScene() {
    const model = this.vectorModel;
    this.svg.replaceChildren();
    this.svg.setAttribute('preserveAspectRatio', 'none');

    const ocean = createSvgElement('rect', {
      class: 'world-map-vector-ocean',
      x: 0,
      y: 0,
      width: model.width,
      height: model.height,
    });
    const fills = createSvgElement('g', { class: 'world-map-vector-fills' });
    const coastline = createSvgElement('path', {
      class: 'world-map-coastline',
      d: model.borders.coastline,
    });
    const borders = createSvgElement('g', { class: 'world-map-borders' });
    const primaryBorders = createSvgElement('path', { class: 'world-map-border-primary' });
    const secondaryBorders = createSvgElement('path', { class: 'world-map-border-secondary' });
    borders.append(secondaryBorders, primaryBorders);

    const routes = createSvgElement('g', { class: 'world-map-routes' });
    const routePaths = new Map();
    for (const route of model.routes) {
      const group = safeClassName(route.group);
      routePaths.set(group, `${routePaths.get(group) ?? ''}${route.d}`);
    }
    for (const [group, d] of routePaths) {
      routes.append(createSvgElement('path', {
        class: `world-map-route ${routeClass(group)}`,
        d,
      }));
    }

    const rivers = createSvgElement('g', { class: 'world-map-rivers' });
    for (const river of model.rivers) {
      rivers.append(createSvgElement('path', {
        class: 'world-map-river',
        d: river.d,
        'stroke-width': river.width,
      }));
    }

    const entityLabels = createSvgElement('g', { class: 'world-map-entity-labels' });
    const burgCapitals = createSvgElement('g', { class: 'world-map-burg-capitals' });
    const burgMinor = createSvgElement('g', { class: 'world-map-burg-minor' });
    const burgLabels = createSvgElement('g', { class: 'world-map-burg-labels' });
    const markers = createSvgElement('g', { class: 'world-map-markers' });
    const player = createSvgElement('g', { class: 'world-map-player' });
    const playerHalo = createSvgElement('circle', { class: 'world-map-player-halo' });
    const playerDot = createSvgElement('circle', { class: 'world-map-player-dot' });
    player.append(playerHalo, playerDot);

    const campaign = this.controller.getCampaignData();
    const stateById = new Map((campaign.states ?? []).map((state) => [Number(state.i), state]));
    const fixedCircles = [
      { element: playerHalo, screenRadius: 9, screenStroke: 0 },
      { element: playerDot, screenRadius: 5, screenStroke: 1.5 },
    ];
    const fixedTexts = [];

    for (const burg of campaign.burgs ?? []) {
      if (!finitePoint(burg) || burg.removed) continue;
      const isCapital = Boolean(burg.capital);
      const circle = createSvgElement('circle', {
        class: isCapital ? 'world-map-burg-symbol capital' : 'world-map-burg-symbol',
        cx: burg.x,
        cy: burg.y,
        fill: stateById.get(Number(burg.state))?.color ?? '#c58b3a',
      });
      (isCapital ? burgCapitals : burgMinor).append(circle);
      fixedCircles.push({
        element: circle,
        screenRadius: isCapital ? 4.5 : 2.7,
        screenStroke: isCapital ? 1.4 : 0.9,
      });

      const label = createSvgElement('text', {
        class: isCapital ? 'world-map-burg-label capital' : 'world-map-burg-label',
        x: burg.x,
        y: burg.y,
        'text-anchor': 'middle',
      });
      label.textContent = burg.name ?? '';
      burgLabels.append(label);
      fixedTexts.push({
        element: label,
        screenSize: isCapital ? 12 : 10.5,
        screenStroke: isCapital ? 3 : 2.5,
        screenOffsetY: isCapital ? -8 : -6,
        sourceY: Number(burg.y),
      });
    }

    for (const marker of campaign.markers ?? []) {
      if (!finitePoint(marker)) continue;
      const icon = createSvgElement('text', {
        class: 'world-map-marker',
        x: marker.x,
        y: marker.y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      icon.textContent = marker.icon || '•';
      markers.append(icon);
      fixedTexts.push({
        element: icon,
        screenSize: 17,
        screenOffsetY: 0,
        sourceY: Number(marker.y),
      });
    }

    this.svg.append(
      ocean,
      fills,
      coastline,
      borders,
      routes,
      rivers,
      entityLabels,
      burgCapitals,
      burgMinor,
      burgLabels,
      markers,
      player,
    );
    this.vectorScene = {
      fills,
      coastline,
      borders,
      primaryBorders,
      secondaryBorders,
      routes,
      rivers,
      entityLabels,
      burgCapitals,
      burgMinor,
      burgLabels,
      markers,
      player,
      playerHalo,
      playerDot,
      fixedCircles,
      fixedTexts,
      entityTextEntries: [],
    };
    this.renderVectorPreset();
  }

  renderVectorPreset() {
    if (!this.vectorScene) return;
    const model = this.vectorModel;
    const fragment = document.createDocumentFragment();
    for (const layer of model.fillLayers[this.preset] ?? []) {
      fragment.append(createSvgElement('path', {
        class: 'world-map-fill-region',
        d: layer.d,
        fill: layer.color,
      }));
    }
    this.vectorScene.fills.replaceChildren(fragment);
    this.vectorScene.primaryBorders.setAttribute(
      'd',
      model.borders.primaryByPreset[this.preset] ?? '',
    );
    this.vectorScene.secondaryBorders.setAttribute(
      'd',
      model.borders.secondaryByPreset[this.preset] ?? '',
    );

    const labels = document.createDocumentFragment();
    this.vectorScene.entityTextEntries = [];
    for (const label of model.labelSets[this.preset] ?? []) {
      const text = createSvgElement('text', {
        class: `world-map-entity-label ${safeClassName(label.kind)}`,
        x: label.x,
        y: label.y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      text.textContent = label.name;
      labels.append(text);
      this.vectorScene.entityTextEntries.push({ element: text, label });
    }
    this.vectorScene.entityLabels.replaceChildren(labels);
    this.applyVectorLayerVisibility();
    this.applyVectorView();
  }

  setPreset(preset) {
    if (!WORLD_MAP_PRESETS.some(({ id }) => id === preset)) return;
    this.preset = preset;
    this.layers = presetLayerDefaults(preset);
    this.syncLayerControls();
    this.renderVectorPreset();
  }

  syncLayerControls() {
    this.presetSelect.value = this.preset;
    for (const [id, input] of this.layerInputs) {
      input.checked = Boolean(this.layers[id]);
    }
  }

  applyVectorLayerVisibility() {
    if (!this.vectorScene || !this.vectorView) return;
    const semantic = vectorSemanticVisibility(this.vectorView.zoom);
    const display = (element, visible) => {
      element.style.display = visible ? '' : 'none';
    };
    display(this.vectorScene.borders, this.layers.borders);
    display(this.vectorScene.routes, this.layers.routes);
    display(this.vectorScene.rivers, this.layers.rivers);
    display(this.vectorScene.burgCapitals, this.layers.burgs);
    display(this.vectorScene.burgMinor, this.layers.burgs && semantic.minorBurgs);
    display(this.vectorScene.entityLabels, this.layers.labels);
    display(
      this.vectorScene.burgLabels,
      this.layers.burgs && this.layers.labels && semantic.burgLabels,
    );
    display(this.vectorScene.markers, this.layers.markers && semantic.markers);
  }

  resetVectorView() {
    if (!this.vectorModel) return;
    const rect = this.body.getBoundingClientRect();
    this.vectorView = createVectorView({
      sourceWidth: this.vectorModel.width,
      sourceHeight: this.vectorModel.height,
      viewportWidth: Math.max(1, rect.width),
      viewportHeight: Math.max(1, rect.height),
    });
  }

  resetLegacyView() {
    if (!this.atlasCanvas) {
      this.legacyView = null;
      return;
    }
    const rect = this.body.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.canvas.width = width;
    this.canvas.height = height;
    const atlasWidth = this.atlasCanvas.width;
    const atlasHeight = this.atlasCanvas.height;
    const fitScale = Math.min(width / atlasWidth, height / atlasHeight);
    let atlasX = atlasWidth / 2;
    let atlasY = atlasHeight / 2;
    const campaign = this.controller.getCampaignData();
    const focus = this.controller.getPlayerFocusWorld();
    if (focus && campaign) {
      const bounds = campaign.source.target;
      const { nx, nz } = canonicalWorldToNormalized(focus.x, focus.z, bounds, this.controller.tileSize);
      atlasX = clamp(nx, 0, 1) * atlasWidth;
      atlasY = clamp(nz, 0, 1) * atlasHeight;
    }
    this.legacyView = { scale: fitScale, minScale: fitScale, atlasX, atlasY };
    this.drawLegacy();
  }

  handleResize() {
    if (this.mode === 'vector' && this.vectorView) {
      const rect = this.body.getBoundingClientRect();
      this.vectorView = resizeVectorView(
        this.vectorView,
        Math.max(1, rect.width),
        Math.max(1, rect.height),
      );
      this.applyVectorView();
      return;
    }
    if (!this.legacyView || !this.atlasCanvas) return;
    const rect = this.body.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.legacyView.minScale = Math.min(width / this.atlasCanvas.width, height / this.atlasCanvas.height);
    this.legacyView.scale = Math.max(this.legacyView.scale, this.legacyView.minScale);
    this.scheduleLegacyDraw();
  }

  applyVectorView() {
    if (!this.vectorView || !this.vectorScene) return;
    const box = vectorViewBox(this.vectorView);
    this.svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
    this.zoomLevel.value = `${this.vectorView.zoom < 10
      ? this.vectorView.zoom.toFixed(1)
      : Math.round(this.vectorView.zoom)}×`;
    const userUnitsPerPixel = box.width / this.vectorView.viewportWidth;

    for (const entry of this.vectorScene.fixedCircles) {
      entry.element.setAttribute('r', entry.screenRadius * userUnitsPerPixel);
      if (entry.screenStroke) {
        entry.element.setAttribute('stroke-width', entry.screenStroke * userUnitsPerPixel);
      }
    }
    for (const entry of this.vectorScene.fixedTexts) {
      entry.element.setAttribute('font-size', entry.screenSize * userUnitsPerPixel);
      entry.element.setAttribute('y', entry.sourceY + entry.screenOffsetY * userUnitsPerPixel);
      if (entry.screenStroke) {
        entry.element.style.strokeWidth = `${entry.screenStroke * userUnitsPerPixel}px`;
      }
    }
    for (const { element, label } of this.vectorScene.entityTextEntries) {
      const baseScreenSize = label.kind === 'province'
        ? 11.5 * label.importance
        : 16 * label.importance;
      element.setAttribute('font-size', clamp(baseScreenSize, 11, 34) * userUnitsPerPixel);
      element.style.strokeWidth = `${3 * userUnitsPerPixel}px`;
    }
    this.applyVectorLayerVisibility();
  }

  updateVectorPlayerMarker() {
    if (!this.vectorScene) return;
    const campaign = this.controller.getCampaignData();
    const focus = this.controller.getPlayerFocusWorld();
    if (!campaign || !focus) {
      this.vectorScene.player.style.display = 'none';
      return;
    }
    const { nx, nz } = canonicalWorldToNormalized(
      focus.x,
      focus.z,
      campaign.source.target,
      this.controller.tileSize,
    );
    const x = clamp(nx, 0, 1) * this.vectorModel.width;
    const y = clamp(nz, 0, 1) * this.vectorModel.height;
    for (const circle of [this.vectorScene.playerHalo, this.vectorScene.playerDot]) {
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
    }
    this.vectorScene.player.style.display = '';
  }

  zoomAtCenter(factor) {
    if (!this.vectorView) return;
    this.vectorView = zoomVectorView(
      this.vectorView,
      factor,
      this.vectorView.viewportWidth / 2,
      this.vectorView.viewportHeight / 2,
    );
    this.applyVectorView();
  }

  vectorPointerPosition(event) {
    const rect = this.svg.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    return {
      screenX,
      screenY,
      source: screenToVectorSource(this.vectorView, screenX, screenY),
    };
  }

  handleWheel(event) {
    event.preventDefault();
    if (this.mode === 'vector' && this.vectorView) {
      const rect = this.svg.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const factor = Math.exp(-event.deltaY * 0.0015);
      this.vectorView = zoomVectorView(this.vectorView, factor, screenX, screenY);
      this.applyVectorView();
      this.tooltip.hidden = true;
      return;
    }
    if (!this.legacyView) return;
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const before = this.legacyScreenToAtlas(screenX, screenY);
    const factor = Math.exp(-event.deltaY * 0.0015);
    const maxScale = this.legacyView.minScale * LEGACY_MAX_ZOOM_FACTOR;
    this.legacyView.scale = clamp(
      this.legacyView.scale * factor,
      this.legacyView.minScale,
      maxScale,
    );
    const after = this.legacyScreenToAtlas(screenX, screenY);
    this.legacyView.atlasX += before.x - after.x;
    this.legacyView.atlasY += before.y - after.y;
    this.clampLegacyView();
    this.scheduleLegacyDraw();
  }

  handlePointerDown(event) {
    if ((this.mode === 'vector' && !this.vectorView)
        || (this.mode !== 'vector' && !this.legacyView)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    this.pointer = {
      target: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      dragged: false,
    };
  }

  handlePointerMove(event) {
    if (!this.pointer) {
      this.updateTooltip(event);
      return;
    }
    const deltaX = event.clientX - this.pointer.lastX;
    const deltaY = event.clientY - this.pointer.lastY;
    if (!this.pointer.dragged) {
      const totalDistance = Math.hypot(
        event.clientX - this.pointer.startX,
        event.clientY - this.pointer.startY,
      );
      if (totalDistance > DRAG_THRESHOLD_PX) {
        this.pointer.dragged = true;
        this.tooltip.hidden = true;
      }
    }
    if (this.pointer.dragged) {
      if (this.mode === 'vector') {
        this.vectorView = panVectorView(this.vectorView, deltaX, deltaY);
        this.applyVectorView();
      } else {
        this.legacyView.atlasX -= deltaX / this.legacyView.scale;
        this.legacyView.atlasY -= deltaY / this.legacyView.scale;
        this.clampLegacyView();
        this.scheduleLegacyDraw();
      }
    }
    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;
  }

  handlePointerUp(event) {
    if (!this.pointer) return;
    if (this.pointer.target.hasPointerCapture(event.pointerId)) {
      this.pointer.target.releasePointerCapture(event.pointerId);
    }
    const { dragged } = this.pointer;
    this.pointer = null;
    if (!dragged) this.handleClick(event);
  }

  handleClick(event) {
    const campaign = this.controller.getCampaignData();
    if (!campaign) return;
    let nx;
    let nz;
    if (this.mode === 'vector') {
      const { source } = this.vectorPointerPosition(event);
      nx = clamp(source.x / this.vectorModel.width, 0, 1);
      nz = clamp(source.y / this.vectorModel.height, 0, 1);
    } else {
      const rect = this.canvas.getBoundingClientRect();
      const atlas = this.legacyScreenToAtlas(event.clientX - rect.left, event.clientY - rect.top);
      nx = clamp(atlas.x / this.atlasCanvas.width, 0, 1);
      nz = clamp(atlas.y / this.atlasCanvas.height, 0, 1);
    }
    const world = normalizedToCanonicalWorld(
      nx,
      nz,
      campaign.source.target,
      this.controller.tileSize,
    );
    this.controller.teleportTo(world.x, world.z);
  }

  updateTooltip(event) {
    if (this.mode !== 'vector') {
      this.updateLegacyTooltip(event);
      return;
    }
    if (!this.vectorView || !this.vectorModel) return;
    const { screenX, screenY, source } = this.vectorPointerPosition(event);
    const cellIndex = findVectorMapCell(this.vectorModel, source.x, source.y);
    if (cellIndex < 0) {
      this.tooltip.hidden = true;
      return;
    }
    const campaign = this.controller.getCampaignData();
    const details = getVectorCellDetails(
      this.vectorModel,
      cellIndex,
      campaign,
      this.controller.getBaseTerrain(),
    );
    const burgById = new Map((campaign.burgs ?? []).map((burg) => [Number(burg.i), burg]));
    const parts = [];
    const burg = details.burgId ? burgById.get(details.burgId) : this.findNearbyRecord(
      campaign.burgs,
      source.x,
      source.y,
    );
    const marker = this.layers.markers
      ? this.findNearbyRecord(campaign.markers, source.x, source.y)
      : null;
    if (burg?.name) parts.push(burg.name);
    if (marker) parts.push(`${marker.icon || 'Marker'} ${marker.type ?? ''}`.trim());
    parts.push(details.biome, `Height ${details.height}`);
    if (details.state) parts.push(details.state);
    if (details.province) parts.push(details.province);
    if (details.culture) parts.push(details.culture);
    if (details.religion) parts.push(details.religion);
    this.showTooltip(parts.join(' · '), screenX, screenY);
  }

  findNearbyRecord(records, sourceX, sourceY) {
    if (!this.vectorView) return null;
    const box = vectorViewBox(this.vectorView);
    const radius = HOVER_RADIUS_PX * box.width / this.vectorView.viewportWidth;
    let nearest = null;
    let nearestDistance = radius;
    for (const record of records ?? []) {
      if (!finitePoint(record) || record.removed) continue;
      const distance = Math.hypot(Number(record.x) - sourceX, Number(record.y) - sourceY);
      if (distance < nearestDistance) {
        nearest = record;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  showTooltip(text, screenX, screenY) {
    this.tooltip.hidden = false;
    this.tooltip.textContent = text;
    const width = this.body.clientWidth;
    const height = this.body.clientHeight;
    this.tooltip.style.left = `${Math.min(screenX + 14, Math.max(8, width - 340))}px`;
    this.tooltip.style.top = `${Math.min(screenY + 14, Math.max(8, height - 52))}px`;
  }

  legacyAtlasToScreen(atlasX, atlasY) {
    const { width, height } = this.canvas;
    const { scale, atlasX: viewX, atlasY: viewY } = this.legacyView;
    return {
      x: (atlasX - viewX) * scale + width / 2,
      y: (atlasY - viewY) * scale + height / 2,
    };
  }

  legacyScreenToAtlas(screenX, screenY) {
    const { width, height } = this.canvas;
    const { scale, atlasX, atlasY } = this.legacyView;
    return {
      x: (screenX - width / 2) / scale + atlasX,
      y: (screenY - height / 2) / scale + atlasY,
    };
  }

  clampLegacyView() {
    const marginX = this.atlasCanvas.width * 0.5;
    const marginY = this.atlasCanvas.height * 0.5;
    this.legacyView.atlasX = clamp(
      this.legacyView.atlasX,
      -marginX,
      this.atlasCanvas.width + marginX,
    );
    this.legacyView.atlasY = clamp(
      this.legacyView.atlasY,
      -marginY,
      this.atlasCanvas.height + marginY,
    );
  }

  scheduleLegacyDraw() {
    if (this.drawQueued) return;
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      this.drawLegacy();
    });
  }

  drawLegacy() {
    if (!this.atlasCanvas || !this.legacyView || this.mode === 'vector') return;
    const ctx = this.context;
    const { width, height } = this.canvas;
    ctx.fillStyle = '#0b0f0c';
    ctx.fillRect(0, 0, width, height);
    const { scale, atlasX, atlasY } = this.legacyView;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.translate(width / 2 - atlasX * scale, height / 2 - atlasY * scale);
    ctx.scale(scale, scale);
    ctx.drawImage(this.atlasCanvas, 0, 0);
    ctx.restore();
    this.drawLegacyBurgs();
    this.drawLegacyPlayerMarker();
  }

  drawLegacyBurgs() {
    const campaign = this.controller.getCampaignData();
    if (!campaign) return;
    const ctx = this.context;
    const stateById = new Map((campaign.states ?? []).map((state) => [state.i, state]));
    const showLabels = this.legacyView.scale > this.legacyView.minScale * 1.4;
    for (const burg of campaign.burgs ?? []) {
      if (!finitePoint(burg)) continue;
      const { nx, nz } = burgToNormalized(burg, campaign.source);
      const { x, y } = this.legacyAtlasToScreen(
        nx * this.atlasCanvas.width,
        nz * this.atlasCanvas.height,
      );
      if (x < -20 || x > this.canvas.width + 20 || y < -20 || y > this.canvas.height + 20) continue;
      const state = stateById.get(burg.state);
      const isCapital = Boolean(burg.capital);
      const radius = isCapital ? 5 : 3;
      ctx.beginPath();
      ctx.fillStyle = state?.color ?? '#e5c76b';
      ctx.strokeStyle = isCapital ? '#f7e9b0' : 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = isCapital ? 2 : 1;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (isCapital || showLabels) {
        ctx.font = isCapital ? '600 12px Inter, sans-serif' : '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(10, 14, 11, 0.85)';
        ctx.strokeText(burg.name, x, y - radius - 4);
        ctx.fillStyle = 'rgba(237, 243, 238, 0.92)';
        ctx.fillText(burg.name, x, y - radius - 4);
      }
    }
  }

  drawLegacyPlayerMarker() {
    const campaign = this.controller.getCampaignData();
    const focus = this.controller.getPlayerFocusWorld();
    if (!campaign || !focus) return;
    const { nx, nz } = canonicalWorldToNormalized(
      focus.x,
      focus.z,
      campaign.source.target,
      this.controller.tileSize,
    );
    const { x, y } = this.legacyAtlasToScreen(
      nx * this.atlasCanvas.width,
      nz * this.atlasCanvas.height,
    );
    const ctx = this.context;
    ctx.beginPath();
    ctx.fillStyle = '#f0cf68';
    ctx.strokeStyle = '#1b1b12';
    ctx.lineWidth = 2;
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  findLegacyBurgNear(screenX, screenY) {
    const campaign = this.controller.getCampaignData();
    if (!campaign || !this.atlasCanvas) return null;
    let nearest = null;
    let nearestDistance = HOVER_RADIUS_PX;
    for (const burg of campaign.burgs ?? []) {
      if (!finitePoint(burg)) continue;
      const { nx, nz } = burgToNormalized(burg, campaign.source);
      const { x, y } = this.legacyAtlasToScreen(
        nx * this.atlasCanvas.width,
        nz * this.atlasCanvas.height,
      );
      const distance = Math.hypot(x - screenX, y - screenY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = burg;
      }
    }
    return nearest;
  }

  updateLegacyTooltip(event) {
    if (!this.atlasCanvas || !this.legacyView) return;
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const burg = this.findLegacyBurgNear(screenX, screenY);
    if (!burg) {
      this.tooltip.hidden = true;
      return;
    }
    const campaign = this.controller.getCampaignData();
    const stateById = new Map((campaign.states ?? []).map((state) => [state.i, state]));
    const state = stateById.get(burg.state);
    this.showTooltip(
      `${burg.name}${burg.capital ? ' (capital)' : ''}${state?.name ? ` · ${state.name}` : ''}`,
      screenX,
      screenY,
    );
  }

  dispose() {
    this.unsubscribe?.();
    this.resizeObserver.disconnect();
    for (const surface of [this.canvas, this.svg]) {
      surface.removeEventListener('wheel', this.onWheel);
      surface.removeEventListener('pointerdown', this.onPointerDown);
      surface.removeEventListener('pointermove', this.onPointerMove);
      surface.removeEventListener('pointerup', this.onPointerUp);
      surface.removeEventListener('pointercancel', this.onPointerUp);
    }
    this.closeButton.removeEventListener('click', this.onClose);
    this.overlay.removeEventListener('click', this.onOverlayClick);
    this.presetSelect.removeEventListener('change', this.onPresetChange);
    for (const input of this.layerInputs.values()) {
      input.removeEventListener('change', this.onLayerChange);
    }
    this.zoomInButton.removeEventListener('click', this.onZoomIn);
    this.zoomOutButton.removeEventListener('click', this.onZoomOut);
    this.zoomResetButton.removeEventListener('click', this.onZoomReset);
    this.overlay.remove();
  }
}
