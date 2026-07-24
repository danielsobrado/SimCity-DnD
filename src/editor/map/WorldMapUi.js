import { hexToRgbBytes } from '../tileCatalog.js';
import { decodeMacroAtlas } from '../import/AzgaarMacroWorldSource.js';
import {
  burgToNormalized,
  canonicalWorldToNormalized,
  normalizedToCanonicalWorld,
} from './worldMapCoordinates.js';

const MAX_ZOOM_FACTOR = 24;
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

export class WorldMapUi {
  constructor({ root, controller }) {
    this.root = root;
    this.controller = controller;

    this.overlay = document.createElement('div');
    this.overlay.className = 'world-map-overlay';
    this.overlay.hidden = true;
    this.overlay.innerHTML = `
      <div class="world-map-panel">
        <div class="world-map-header">
          <h2>World Map</h2>
          <div class="world-map-hint">
            Click a location to send your player there · drag to pan · scroll to zoom · Esc to close
          </div>
          <button type="button" class="world-map-close" data-role="world-map-close" aria-label="Close world map">✕</button>
        </div>
        <div class="world-map-body" data-role="world-map-body">
          <canvas class="world-map-canvas" data-role="world-map-canvas"></canvas>
          <div class="world-map-empty" data-role="world-map-empty" hidden>
            Import an Azgaar map to use the world map.
          </div>
          <div class="world-map-tooltip" data-role="world-map-tooltip" hidden></div>
        </div>
      </div>
    `;
    root.append(this.overlay);

    this.body = this.overlay.querySelector('[data-role="world-map-body"]');
    this.canvas = this.overlay.querySelector('[data-role="world-map-canvas"]');
    this.emptyState = this.overlay.querySelector('[data-role="world-map-empty"]');
    this.tooltip = this.overlay.querySelector('[data-role="world-map-tooltip"]');
    this.closeButton = this.overlay.querySelector('[data-role="world-map-close"]');
    this.context = this.canvas.getContext('2d', { alpha: false });

    this.atlasCanvas = null;
    this.atlasSourceRef = null;
    this.view = null;
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
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);

    this.unsubscribe = controller.subscribe((state) => this.render(state));
  }

  render(state) {
    const opening = state.isOpen && !this.wasOpen;
    this.wasOpen = state.isOpen;
    this.overlay.hidden = !state.isOpen;
    this.tooltip.hidden = true;
    if (!state.isOpen) return;

    if (!state.available) {
      this.emptyState.hidden = false;
      this.canvas.hidden = true;
      return;
    }
    this.emptyState.hidden = true;
    this.canvas.hidden = false;

    if (!this.resizeObserved) {
      this.resizeObserved = true;
      this.resizeObserver.observe(this.body);
    }
    this.ensureAtlas();
    if (opening || !this.view) {
      this.resetView();
    }
    this.draw();
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

  resetView() {
    if (!this.atlasCanvas) {
      this.view = null;
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

    this.view = { scale: fitScale, minScale: fitScale, atlasX, atlasY };
  }

  handleResize() {
    if (!this.view || !this.atlasCanvas) return;
    const rect = this.body.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    const atlasWidth = this.atlasCanvas.width;
    const atlasHeight = this.atlasCanvas.height;
    this.view.minScale = Math.min(width / atlasWidth, height / atlasHeight);
    this.view.scale = Math.max(this.view.scale, this.view.minScale);
    this.scheduleDraw();
  }

  clampView() {
    const atlasWidth = this.atlasCanvas.width;
    const atlasHeight = this.atlasCanvas.height;
    const marginX = atlasWidth * 0.5;
    const marginY = atlasHeight * 0.5;
    this.view.atlasX = clamp(this.view.atlasX, -marginX, atlasWidth + marginX);
    this.view.atlasY = clamp(this.view.atlasY, -marginY, atlasHeight + marginY);
  }

  atlasToScreen(atlasX, atlasY) {
    const { width, height } = this.canvas;
    const { scale, atlasX: viewX, atlasY: viewY } = this.view;
    return {
      x: (atlasX - viewX) * scale + width / 2,
      y: (atlasY - viewY) * scale + height / 2,
    };
  }

  screenToAtlas(screenX, screenY) {
    const { width, height } = this.canvas;
    const { scale, atlasX, atlasY } = this.view;
    return {
      x: (screenX - width / 2) / scale + atlasX,
      y: (screenY - height / 2) / scale + atlasY,
    };
  }

  scheduleDraw() {
    if (this.drawQueued) return;
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      this.draw();
    });
  }

  draw() {
    if (!this.atlasCanvas || !this.view) return;
    const ctx = this.context;
    const { width, height } = this.canvas;
    ctx.fillStyle = '#0b0f0c';
    ctx.fillRect(0, 0, width, height);

    const { scale, atlasX, atlasY } = this.view;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.translate(width / 2 - atlasX * scale, height / 2 - atlasY * scale);
    ctx.scale(scale, scale);
    ctx.drawImage(this.atlasCanvas, 0, 0);
    ctx.restore();

    this.drawBurgs();
    this.drawPlayerMarker();
  }

  drawBurgs() {
    const campaign = this.controller.getCampaignData();
    if (!campaign) return;
    const ctx = this.context;
    const stateById = new Map((campaign.states ?? []).map((state) => [state.i, state]));
    const atlasWidth = this.atlasCanvas.width;
    const atlasHeight = this.atlasCanvas.height;
    const showLabels = this.view.scale > this.view.minScale * 1.4;

    for (const burg of campaign.burgs ?? []) {
      if (!Number.isFinite(burg.x) || !Number.isFinite(burg.y)) continue;
      const { nx, nz } = burgToNormalized(burg, campaign.source);
      const { x, y } = this.atlasToScreen(nx * atlasWidth, nz * atlasHeight);
      if (x < -20 || x > this.canvas.width + 20 || y < -20 || y > this.canvas.height + 20) continue;

      const state = stateById.get(burg.state);
      const color = state?.color ?? '#e5c76b';
      const isCapital = Boolean(burg.capital);
      const radius = isCapital ? 5 : 3;

      ctx.beginPath();
      ctx.fillStyle = color;
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

  drawPlayerMarker() {
    const campaign = this.controller.getCampaignData();
    const focus = this.controller.getPlayerFocusWorld();
    if (!campaign || !focus) return;
    const bounds = campaign.source.target;
    const { nx, nz } = canonicalWorldToNormalized(focus.x, focus.z, bounds, this.controller.tileSize);
    const { x, y } = this.atlasToScreen(nx * this.atlasCanvas.width, nz * this.atlasCanvas.height);
    const ctx = this.context;
    ctx.beginPath();
    ctx.fillStyle = '#f0cf68';
    ctx.strokeStyle = '#1b1b12';
    ctx.lineWidth = 2;
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  findBurgNear(screenX, screenY) {
    const campaign = this.controller.getCampaignData();
    if (!campaign || !this.atlasCanvas) return null;
    const atlasWidth = this.atlasCanvas.width;
    const atlasHeight = this.atlasCanvas.height;
    let nearest = null;
    let nearestDistance = HOVER_RADIUS_PX;
    for (const burg of campaign.burgs ?? []) {
      if (!Number.isFinite(burg.x) || !Number.isFinite(burg.y)) continue;
      const { nx, nz } = burgToNormalized(burg, campaign.source);
      const { x, y } = this.atlasToScreen(nx * atlasWidth, nz * atlasHeight);
      const distance = Math.hypot(x - screenX, y - screenY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = burg;
      }
    }
    return nearest;
  }

  updateTooltip(event) {
    if (!this.atlasCanvas || !this.view) return;
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const burg = this.findBurgNear(screenX, screenY);
    if (!burg) {
      this.tooltip.hidden = true;
      return;
    }
    const campaign = this.controller.getCampaignData();
    const stateById = new Map((campaign.states ?? []).map((state) => [state.i, state]));
    const state = stateById.get(burg.state);
    this.tooltip.hidden = false;
    this.tooltip.textContent = `${burg.name}${burg.capital ? ' (capital)' : ''}${state?.name ? ` · ${state.name}` : ''}`;
    this.tooltip.style.left = `${screenX + 14}px`;
    this.tooltip.style.top = `${screenY + 14}px`;
  }

  handleWheel(event) {
    if (!this.view) return;
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const before = this.screenToAtlas(screenX, screenY);
    const factor = Math.exp(-event.deltaY * 0.0015);
    const maxScale = this.view.minScale * MAX_ZOOM_FACTOR;
    this.view.scale = clamp(this.view.scale * factor, this.view.minScale, maxScale);
    const after = this.screenToAtlas(screenX, screenY);
    this.view.atlasX += before.x - after.x;
    this.view.atlasY += before.y - after.y;
    this.clampView();
    this.scheduleDraw();
  }

  handlePointerDown(event) {
    if (!this.view) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.pointer = {
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
      this.view.atlasX -= deltaX / this.view.scale;
      this.view.atlasY -= deltaY / this.view.scale;
      this.clampView();
      this.scheduleDraw();
    }
    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;
  }

  handlePointerUp(event) {
    if (!this.pointer) return;
    this.canvas.releasePointerCapture(event.pointerId);
    const { dragged } = this.pointer;
    this.pointer = null;
    if (dragged) return;
    this.handleClick(event);
  }

  handleClick(event) {
    const campaign = this.controller.getCampaignData();
    if (!campaign || !this.view) return;
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const atlas = this.screenToAtlas(screenX, screenY);
    const atlasWidth = this.atlasCanvas.width;
    const atlasHeight = this.atlasCanvas.height;
    const nx = clamp(atlas.x / atlasWidth, 0, 1);
    const nz = clamp(atlas.y / atlasHeight, 0, 1);
    const bounds = campaign.source.target;
    const world = normalizedToCanonicalWorld(nx, nz, bounds, this.controller.tileSize);
    this.controller.teleportTo(world.x, world.z);
  }

  dispose() {
    this.unsubscribe?.();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.closeButton.removeEventListener('click', this.onClose);
    this.overlay.removeEventListener('click', this.onOverlayClick);
    this.overlay.remove();
  }
}
