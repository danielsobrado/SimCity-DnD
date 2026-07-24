import { PLAYER_MODE_WALK } from '../player/playerConstants.js';

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

  teleportTo(canonicalX, canonicalZ) {
    const viewModeController = this.getViewModeController?.();
    const playerController = this.getPlayerController?.();
    if (!viewModeController || !playerController) return;
    const render = this.floatingOrigin.toRender(canonicalX, canonicalZ);

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
