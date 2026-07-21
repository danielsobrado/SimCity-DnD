import {
  MAX_HISTORY_ENTRIES,
  PAINT_INTERVAL_MS,
  PRIMARY_POINTER_BUTTON,
} from './constants.js';
import { TILE_BY_ID, TILE_BY_SHORTCUT } from './tileCatalog.js';

export class EditorController {
  constructor({ tileMap, terrainView, editorCamera, brushSizes, defaultBrushSize }) {
    this.tileMap = tileMap;
    this.terrainView = terrainView;
    this.editorCamera = editorCamera;
    this.brushSizes = brushSizes;
    this.selectedTileId = 0;
    this.brushSize = brushSizes.includes(defaultBrushSize) ? defaultBrushSize : brushSizes[0];
    this.undoStack = [];
    this.redoStack = [];
    this.stroke = null;
    this.painting = false;
    this.spacePressed = false;
    this.hoveredCell = null;
    this.lastPaintKey = null;
    this.lastPaintAt = 0;
    this.listeners = new Set();
    this.mapListeners = new Set();
    this.hoverListeners = new Set();

    this.canvas = terrainView.renderer.domElement;
    this.boundHandlers = {
      pointerDown: (event) => this.onPointerDown(event),
      pointerMove: (event) => this.onPointerMove(event),
      pointerUp: (event) => this.onPointerUp(event),
      pointerLeave: () => this.onPointerLeave(),
      contextMenu: (event) => event.preventDefault(),
      keyDown: (event) => this.onKeyDown(event),
      keyUp: (event) => this.onKeyUp(event),
    };

    this.canvas.addEventListener('pointerdown', this.boundHandlers.pointerDown);
    this.canvas.addEventListener('pointermove', this.boundHandlers.pointerMove);
    this.canvas.addEventListener('pointerup', this.boundHandlers.pointerUp);
    this.canvas.addEventListener('pointercancel', this.boundHandlers.pointerUp);
    this.canvas.addEventListener('pointerleave', this.boundHandlers.pointerLeave);
    this.canvas.addEventListener('contextmenu', this.boundHandlers.contextMenu);
    window.addEventListener('keydown', this.boundHandlers.keyDown);
    window.addEventListener('keyup', this.boundHandlers.keyUp);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  subscribeMap(listener) {
    this.mapListeners.add(listener);
    return () => this.mapListeners.delete(listener);
  }

  subscribeHover(listener) {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  }

  getState() {
    return {
      selectedTileId: this.selectedTileId,
      brushSize: this.brushSize,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
  }

  selectTile(tileId) {
    if (!TILE_BY_ID.has(tileId)) {
      return;
    }
    this.selectedTileId = tileId;
    this.updatePreview();
    this.emitState();
  }

  selectBrush(brushSize) {
    if (!this.brushSizes.includes(brushSize)) {
      return;
    }
    this.brushSize = brushSize;
    this.updatePreview();
    this.emitState();
  }

  undo() {
    const patch = this.undoStack.pop();
    if (!patch) {
      return;
    }
    this.tileMap.applyPatch(patch, 'undo');
    this.terrainView.updatePatch(patch);
    this.redoStack.push(patch);
    this.emitMap();
    this.emitState();
  }

  redo() {
    const patch = this.redoStack.pop();
    if (!patch) {
      return;
    }
    this.tileMap.applyPatch(patch, 'redo');
    this.terrainView.updatePatch(patch);
    this.undoStack.push(patch);
    this.emitMap();
    this.emitState();
  }

  fill(tileId) {
    const patch = this.tileMap.fill(tileId);
    if (patch.indices.length === 0) {
      return;
    }
    this.terrainView.updatePatch(patch);
    this.commitPatch(patch);
    this.emitMap();
  }

  loadDocument(document) {
    this.tileMap.loadDocument(document);
    this.terrainView.refreshAll();
    this.undoStack = [];
    this.redoStack = [];
    this.emitMap();
    this.emitState();
  }

  focusCell(x, z) {
    const world = this.terrainView.cellToWorld(x, z);
    this.editorCamera.focusWorld(world.x, world.z);
  }

  resetCamera() {
    this.editorCamera.reset();
  }

  onPointerDown(event) {
    if (event.button !== PRIMARY_POINTER_BUTTON || this.spacePressed) {
      return;
    }

    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.painting = true;
    this.stroke = new Map();
    this.lastPaintKey = null;
    this.paintFromPointer(event, true);
  }

  onPointerMove(event) {
    const cell = this.terrainView.pickCell(event.clientX, event.clientY, this.editorCamera.camera);
    this.hoveredCell = cell;
    this.updatePreview();
    this.emitHover(cell);

    if (this.painting && !this.spacePressed) {
      this.paintFromPointer(event, false);
    }
  }

  onPointerUp(event) {
    if (event.button !== PRIMARY_POINTER_BUTTON || !this.painting) {
      return;
    }

    this.painting = false;
    this.lastPaintKey = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.finishStroke();
  }

  onPointerLeave() {
    if (!this.painting) {
      this.hoveredCell = null;
      this.terrainView.setPreview(null);
      this.emitHover(null);
    }
  }

  paintFromPointer(event, force) {
    const now = performance.now();
    if (!force && now - this.lastPaintAt < PAINT_INTERVAL_MS) {
      return;
    }

    const cell = this.terrainView.pickCell(event.clientX, event.clientY, this.editorCamera.camera);
    if (!cell) {
      return;
    }

    const key = `${cell.x}:${cell.z}`;
    if (!force && key === this.lastPaintKey) {
      return;
    }

    const patch = this.tileMap.paintSquare(cell.x, cell.z, this.brushSize, this.selectedTileId);
    this.lastPaintKey = key;
    this.lastPaintAt = now;

    if (patch.indices.length === 0) {
      return;
    }

    this.mergeStroke(patch);
    this.terrainView.updatePatch(patch);
    this.emitMap(false);
  }

  mergeStroke(patch) {
    for (let offset = 0; offset < patch.indices.length; offset += 1) {
      const index = patch.indices[offset];
      const existing = this.stroke.get(index);
      if (existing) {
        existing.after = patch.after[offset];
      } else {
        this.stroke.set(index, {
          before: patch.before[offset],
          after: patch.after[offset],
        });
      }
    }
  }

  finishStroke() {
    if (!this.stroke || this.stroke.size === 0) {
      this.stroke = null;
      return;
    }

    const patch = { indices: [], before: [], after: [] };
    for (const [index, change] of this.stroke.entries()) {
      patch.indices.push(index);
      patch.before.push(change.before);
      patch.after.push(change.after);
    }

    this.stroke = null;
    this.commitPatch(patch);
    this.emitMap();
  }

  commitPatch(patch) {
    this.undoStack.push(patch);
    if (this.undoStack.length > MAX_HISTORY_ENTRIES) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.emitState();
  }

  onKeyDown(event) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (event.code === 'Space' && !this.spacePressed) {
      event.preventDefault();
      this.spacePressed = true;
      this.editorCamera.setLeftPanEnabled(true);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }

    const tile = TILE_BY_SHORTCUT.get(event.key);
    if (tile) {
      this.selectTile(tile.id);
      return;
    }

    if (event.key === '[') {
      this.cycleBrush(-1);
    } else if (event.key === ']') {
      this.cycleBrush(1);
    }
  }

  onKeyUp(event) {
    if (event.code !== 'Space') {
      return;
    }
    this.spacePressed = false;
    this.editorCamera.setLeftPanEnabled(false);
  }

  cycleBrush(direction) {
    const currentIndex = this.brushSizes.indexOf(this.brushSize);
    const nextIndex = Math.max(0, Math.min(this.brushSizes.length - 1, currentIndex + direction));
    this.selectBrush(this.brushSizes[nextIndex]);
  }

  updatePreview() {
    const tile = TILE_BY_ID.get(this.selectedTileId);
    this.terrainView.setPreview(this.hoveredCell, this.brushSize, tile.color);
  }

  emitState() {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  emitMap(final = true) {
    for (const listener of this.mapListeners) {
      listener({ final });
    }
  }

  emitHover(cell) {
    const tileId = cell ? this.tileMap.get(cell.x, cell.z) : null;
    const tile = tileId === null ? null : TILE_BY_ID.get(tileId);
    for (const listener of this.hoverListeners) {
      listener(cell ? { ...cell, tile } : null);
    }
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.boundHandlers.pointerDown);
    this.canvas.removeEventListener('pointermove', this.boundHandlers.pointerMove);
    this.canvas.removeEventListener('pointerup', this.boundHandlers.pointerUp);
    this.canvas.removeEventListener('pointercancel', this.boundHandlers.pointerUp);
    this.canvas.removeEventListener('pointerleave', this.boundHandlers.pointerLeave);
    this.canvas.removeEventListener('contextmenu', this.boundHandlers.contextMenu);
    window.removeEventListener('keydown', this.boundHandlers.keyDown);
    window.removeEventListener('keyup', this.boundHandlers.keyUp);
  }
}
