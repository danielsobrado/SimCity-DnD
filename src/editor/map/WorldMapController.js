import { PLAYER_MODE_WALK } from '../player/playerConstants.js';
import { cellCenterToWorld, worldToCell } from '../world/WorldCoordinates.js';
import { findNearestLandCell } from './worldMapCoordinates.js';

const WATER_TILE_ID = 0;
const MAX_LAND_SNAP_RINGS = 24;

export class WorldMapController {
  constructor({
    worldStore,
    floatingOrigin,
    tileSize,
    getViewModeController,
    getPlayerController,
    getCampaign,
  }) {
    this.worldStore = worldStore;
    this.floatingOrigin = floatingOrigin;
    this.tileSize = tileSize;
    this.getViewModeController = getViewModeController;
    this.getPlayerController = getPlayerController;
    this.getCampaign = getCampaign;

    this.isOpen = false;
    this.wasPointerLocked = false;
    this.listeners = new Set();

    this.boundHandlers = {
      keyDown: (event) => this.onKeyDown(event),
      keyUp: (event) => this.onKeyUp(event),
    };
    window.addEventListener('keydown', this.boundHandlers.keyDown, true);
    window.addEventListener('keyup', this.boundHandlers.keyUp, true);
  }

  getCampaignData() {
    return this.getCampaign?.() ?? null;
  }

  getBaseTerrain() {
    return this.worldStore?.baseTerrain ?? null;
  }

  hasWorldMap() {
    return Boolean(this.getCampaignData() && this.getBaseTerrain());
  }

  getState() {
    return Object.freeze({
      isOpen: this.isOpen,
      available: this.hasWorldMap(),
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  emit() {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  open() {
    if (this.isOpen) return;
    const playerController = this.getPlayerController?.();
    this.wasPointerLocked = Boolean(playerController?.pointerLocked);
    if (this.wasPointerLocked) {
      document.exitPointerLock();
    }
    this.isOpen = true;
    this.emit();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.wasPointerLocked) {
      const playerController = this.getPlayerController?.();
      playerController?.requestPointerLock();
    }
    this.wasPointerLocked = false;
    this.emit();
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  getPlayerFocusWorld() {
    const viewModeController = this.getViewModeController?.();
    if (!viewModeController) return null;
    const render = viewModeController.getFocusWorld();
    return this.floatingOrigin.toCanonical(render.x, render.z);
  }

  // The streamed terrain derives land/water from the coarse macro atlas, so a
  // click on a fine vector coastline can point at an ocean cell. Snap the target
  // to the nearest cell the player can actually stand on above sea level.
  resolveLandTarget(canonicalX, canonicalZ) {
    const baseTerrain = this.getBaseTerrain();
    const bounds = baseTerrain?.bounds;
    const atlas = baseTerrain?.atlas;
    if (!bounds || !atlas || !this.worldStore) {
      return { x: canonicalX, z: canonicalZ, snapped: false, found: true };
    }
    const seaLevel = baseTerrain.terrain?.seaLevel ?? -1.5;
    const cell = worldToCell(canonicalX, canonicalZ, this.tileSize);
    const stepCells = Math.max(1, Math.round(bounds.widthCells / atlas.width));
    const isLand = (cellX, cellZ) => this.worldStore.getTile(cellX, cellZ) !== WATER_TILE_ID
      && this.worldStore.getCellHeight(cellX, cellZ) > seaLevel;

    const result = findNearestLandCell(cell.x, cell.z, isLand, {
      stepCells,
      maxRings: MAX_LAND_SNAP_RINGS,
    });
    const world = cellCenterToWorld(result.x, result.z, this.tileSize);
    return {
      x: world.x,
      z: world.z,
      snapped: result.snapped,
      found: result.found,
      clickedCell: cell,
      targetCell: { x: result.x, z: result.z },
    };
  }

  teleportTo(canonicalX, canonicalZ) {
    const viewModeController = this.getViewModeController?.();
    const playerController = this.getPlayerController?.();
    if (!viewModeController || !playerController) return;

    const target = this.resolveLandTarget(canonicalX, canonicalZ);
    if (target.clickedCell) {
      // Leaves a breadcrumb in DevTools for debugging misfired teleports.
      console.info(
        '[world-map] teleport',
        target.snapped ? 'snapped to shore' : (target.found ? 'on land' : 'no land found'),
        { clicked: target.clickedCell, target: target.targetCell },
      );
    }
    const render = this.floatingOrigin.toRender(target.x, target.z);

    if (viewModeController.mode === PLAYER_MODE_WALK) {
      playerController.setPose({ x: render.x, z: render.z });
      playerController.requestPointerLock();
    } else {
      viewModeController.setMode(PLAYER_MODE_WALK, {
        spawn: render,
        requestPointerLock: true,
      });
    }
    this.close();
  }

  onKeyDown(event) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (event.code === 'KeyM' && !event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.toggle();
      return;
    }
    if (this.isOpen) {
      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
        return;
      }
      event.stopImmediatePropagation();
    }
  }

  onKeyUp(event) {
    if (this.isOpen) {
      event.stopImmediatePropagation();
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.boundHandlers.keyDown, true);
    window.removeEventListener('keyup', this.boundHandlers.keyUp, true);
    this.listeners.clear();
  }
}
