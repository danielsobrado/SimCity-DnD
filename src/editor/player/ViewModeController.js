import {
  PLAYER_MODE_EDIT,
  PLAYER_MODE_WALK,
  PLAYER_MODES,
} from './playerConstants.js';

export class ViewModeController {
  constructor({ editorCamera, playerController }) {
    this.editorCamera = editorCamera;
    this.playerController = playerController;
    this.mode = PLAYER_MODE_EDIT;
    this.listeners = new Set();
    this.unsubscribePlayer = playerController.subscribe(() => this.emit());
    this.editorCamera.setEnabled(true);
    this.playerController.setEnabled(false);
  }

  get camera() {
    return this.mode === PLAYER_MODE_WALK
      ? this.playerController.camera
      : this.editorCamera.camera;
  }

  getState() {
    return Object.freeze({
      mode: this.mode,
      player: this.playerController.getStatus(),
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  setMode(mode, { requestPointerLock = false } = {}) {
    if (!PLAYER_MODES.includes(mode) || mode === this.mode) {
      if (mode === PLAYER_MODE_WALK && requestPointerLock) {
        this.playerController.requestPointerLock();
      }
      return;
    }

    if (mode === PLAYER_MODE_WALK) {
      const spawn = this.editorCamera.getFocusWorld();
      this.mode = PLAYER_MODE_WALK;
      this.editorCamera.setEnabled(false);
      this.playerController.setEnabled(true, spawn);
      if (requestPointerLock) {
        this.playerController.requestPointerLock();
      }
    } else {
      const focus = this.playerController.getFocusWorld();
      this.mode = PLAYER_MODE_EDIT;
      this.playerController.setEnabled(false);
      this.editorCamera.setEnabled(true);
      this.editorCamera.focusWorld(focus.x, focus.z);
    }

    this.emit();
  }

  resize(width, height) {
    this.editorCamera.resize(width, height);
    this.playerController.resize(width, height);
  }

  update(timestamp) {
    if (this.mode === PLAYER_MODE_WALK) {
      this.playerController.update(timestamp);
    } else {
      this.editorCamera.update();
    }
  }

  getFocusWorld() {
    return this.mode === PLAYER_MODE_WALK
      ? this.playerController.getFocusWorld()
      : this.editorCamera.getFocusWorld();
  }

  emit() {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  dispose() {
    this.unsubscribePlayer?.();
    this.playerController.dispose();
    this.listeners.clear();
  }
}
