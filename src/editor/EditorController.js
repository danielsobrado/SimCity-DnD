import {
  MAX_HISTORY_ENTRIES,
  PAINT_INTERVAL_MS,
  PRIMARY_POINTER_BUTTON,
  VALID_EDITOR_TOOLS,
} from './constants.js';
import { createWorldDocument, loadWorldDocument } from './WorldDocument.js';
import { TILE_BY_ID, TILE_BY_SHORTCUT } from './tileCatalog.js';

export class EditorController {
  constructor({
    tileMap,
    objectMap,
    terrainView,
    objectView,
    editorCamera,
    objectCatalog,
    brushSizes,
    defaultBrushSize,
  }) {
    this.tileMap = tileMap;
    this.objectMap = objectMap;
    this.terrainView = terrainView;
    this.objectView = objectView;
    this.editorCamera = editorCamera;
    this.objectCatalog = objectCatalog;
    this.brushSizes = brushSizes;
    this.tool = 'terrain';
    this.selectedTileId = 0;
    this.selectedObjectKey = objectCatalog[0].key;
    this.objectRotation = 0;
    this.selectedObjectId = null;
    this.movingObjectId = null;
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
    this.noticeListeners = new Set();

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

  subscribeNotice(listener) {
    this.noticeListeners.add(listener);
    return () => this.noticeListeners.delete(listener);
  }

  getState() {
    const selectedObject = this.selectedObjectId
      ? this.objectMap.getById(this.selectedObjectId)
      : null;
    return {
      tool: this.tool,
      selectedTileId: this.selectedTileId,
      selectedObjectKey: this.selectedObjectKey,
      objectRotation: this.objectRotation,
      selectedObject,
      isMovingSelected: this.movingObjectId !== null,
      objectCount: this.objectMap.size,
      brushSize: this.brushSize,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
  }

  selectTool(tool) {
    if (!VALID_EDITOR_TOOLS.includes(tool)) {
      return;
    }
    this.tool = tool;
    if (tool !== 'select') {
      this.setSelectedObject(null);
    }
    this.updatePreviews();
    this.emitState();
  }

  selectTile(tileId) {
    if (!TILE_BY_ID.has(tileId)) {
      return;
    }
    this.selectedTileId = tileId;
    this.tool = 'terrain';
    this.setSelectedObject(null);
    this.updatePreviews();
    this.emitState();
  }

  selectObjectDefinition(definitionKey) {
    if (!this.objectMap.definitionByKey.has(definitionKey)) {
      return;
    }
    this.selectedObjectKey = definitionKey;
    this.tool = 'object';
    this.setSelectedObject(null);
    this.updatePreviews();
    this.emitState();
  }

  selectBrush(brushSize) {
    if (!this.brushSizes.includes(brushSize)) {
      return;
    }
    this.brushSize = brushSize;
    this.updatePreviews();
    this.emitState();
  }

  rotatePlacement() {
    this.objectRotation = (this.objectRotation + 1) % 4;
    this.updatePreviews();
    this.emitState();
  }

  rotateSelected() {
    const before = this.selectedObjectId
      ? this.objectMap.getById(this.selectedObjectId)
      : null;
    if (!before) {
      return;
    }

    try {
      const after = this.objectMap.transform(before.id, {
        x: before.x,
        z: before.z,
        rotation: before.rotation + 1,
      });
      this.commitHistory({ kind: 'object', before, after });
      this.refreshObjects();
      this.emitMap();
    } catch (error) {
      this.emitNotice(error.message, true);
    }
  }

  startMoveSelected() {
    if (!this.selectedObjectId) {
      return;
    }
    this.movingObjectId = this.selectedObjectId;
    this.updatePreviews();
    this.emitState();
  }

  deleteSelected() {
    if (!this.selectedObjectId) {
      return;
    }
    const before = this.objectMap.remove(this.selectedObjectId);
    if (!before) {
      return;
    }
    this.selectedObjectId = null;
    this.movingObjectId = null;
    this.commitHistory({ kind: 'object', before, after: null });
    this.refreshObjects();
    this.emitMap();
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) {
      return;
    }
    this.applyHistory(entry, 'undo');
    this.redoStack.push(entry);
    this.emitMap();
    this.emitState();
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) {
      return;
    }
    this.applyHistory(entry, 'redo');
    this.undoStack.push(entry);
    this.emitMap();
    this.emitState();
  }

  applyHistory(entry, direction) {
    if (entry.kind === 'terrain') {
      this.tileMap.applyPatch(entry.patch, direction);
      this.terrainView.updatePatch(entry.patch);
      return;
    }

    if (entry.kind === 'object') {
      this.objectMap.applyChange(entry, direction);
      this.refreshObjects();
      return;
    }

    if (entry.kind === 'world') {
      this.tileMap.applyPatch(entry.terrainPatch, direction);
      this.terrainView.updatePatch(entry.terrainPatch);
      this.objectMap.replaceAll(direction === 'undo' ? entry.beforeObjects : entry.afterObjects);
      this.setSelectedObject(null);
      this.refreshObjects();
    }
  }

  clearWorld() {
    const beforeObjects = this.objectMap.clear();
    const terrainPatch = this.tileMap.fill(0);
    if (beforeObjects.length === 0 && terrainPatch.indices.length === 0) {
      return;
    }

    this.commitHistory({
      kind: 'world',
      terrainPatch,
      beforeObjects,
      afterObjects: [],
    });
    this.setSelectedObject(null);
    this.terrainView.updatePatch(terrainPatch);
    this.refreshObjects();
    this.emitMap();
  }

  toDocument() {
    return createWorldDocument(this.tileMap, this.objectMap);
  }

  loadDocument(document) {
    loadWorldDocument(document, this.tileMap, this.objectMap);
    this.terrainView.refreshAll();
    this.refreshObjects();
    this.undoStack = [];
    this.redoStack = [];
    this.setSelectedObject(null);
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
    if (this.tool === 'terrain') {
      this.canvas.setPointerCapture(event.pointerId);
      this.painting = true;
      this.stroke = new Map();
      this.lastPaintKey = null;
      this.paintFromPointer(event, true);
      return;
    }

    if (this.tool === 'object') {
      const cell = this.terrainView.pickCell(event.clientX, event.clientY, this.editorCamera.camera);
      if (cell) {
        this.placeObject(cell);
      }
      return;
    }

    if (this.movingObjectId) {
      const cell = this.terrainView.pickCell(event.clientX, event.clientY, this.editorCamera.camera);
      if (cell) {
        this.moveSelectedTo(cell);
      }
      return;
    }

    const objectId = this.objectView.pickObject(
      event.clientX,
      event.clientY,
      this.editorCamera.camera,
    );
    this.setSelectedObject(objectId);
    this.emitState();
  }

  onPointerMove(event) {
    const cell = this.terrainView.pickCell(event.clientX, event.clientY, this.editorCamera.camera);
    this.hoveredCell = cell;
    this.updatePreviews();
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
    if (this.painting) {
      return;
    }
    this.hoveredCell = null;
    this.updatePreviews();
    this.emitHover(null);
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

    const patch = this.tileMap.paintSquare(
      cell.x,
      cell.z,
      this.brushSize,
      this.selectedTileId,
      (x, z) => this.objectMap.canSetTerrain(x, z, this.selectedTileId),
    );
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
    this.commitHistory({ kind: 'terrain', patch });
    this.emitMap();
  }

  placeObject(cell) {
    const validation = this.objectMap.validatePlacement({
      definitionKey: this.selectedObjectKey,
      x: cell.x,
      z: cell.z,
      rotation: this.objectRotation,
    });
    if (!validation.valid) {
      this.emitNotice(validation.reason, true);
      return;
    }

    const after = this.objectMap.place({
      definitionKey: this.selectedObjectKey,
      x: cell.x,
      z: cell.z,
      rotation: this.objectRotation,
    });
    this.commitHistory({ kind: 'object', before: null, after });
    this.refreshObjects();
    this.emitMap();
  }

  moveSelectedTo(cell) {
    const before = this.movingObjectId
      ? this.objectMap.getById(this.movingObjectId)
      : null;
    if (!before) {
      this.movingObjectId = null;
      return;
    }

    try {
      const after = this.objectMap.transform(before.id, {
        x: cell.x,
        z: cell.z,
        rotation: before.rotation,
      });
      this.movingObjectId = null;
      this.commitHistory({ kind: 'object', before, after });
      this.refreshObjects();
      this.emitMap();
    } catch (error) {
      this.emitNotice(error.message, true);
    }
  }

  commitHistory(entry) {
    this.undoStack.push(entry);
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

    switch (event.key.toLowerCase()) {
      case 't':
        this.selectTool('terrain');
        break;
      case 'o':
        this.selectTool('object');
        break;
      case 'v':
        this.selectTool('select');
        break;
      case 'r':
        this.tool === 'select' ? this.rotateSelected() : this.rotatePlacement();
        break;
      case 'delete':
      case 'backspace':
        if (this.tool === 'select') {
          event.preventDefault();
          this.deleteSelected();
        }
        break;
      case 'escape':
        this.movingObjectId = null;
        this.setSelectedObject(null);
        this.emitState();
        break;
      case '[':
        this.cycleBrush(-1);
        break;
      case ']':
        this.cycleBrush(1);
        break;
      default:
        break;
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

  updatePreviews() {
    if (this.tool === 'terrain') {
      const tile = TILE_BY_ID.get(this.selectedTileId);
      this.terrainView.setPreview(this.hoveredCell, this.brushSize, tile.color);
      this.objectView.setPreview(null);
      return;
    }

    this.terrainView.setPreview(null);
    if (!this.hoveredCell) {
      this.objectView.setPreview(null);
      return;
    }

    if (this.tool === 'select' && this.movingObjectId) {
      const object = this.objectMap.getById(this.movingObjectId);
      const validation = this.objectMap.validatePlacement({
        definitionKey: object.definitionKey,
        x: this.hoveredCell.x,
        z: this.hoveredCell.z,
        rotation: object.rotation,
        ignoreObjectId: object.id,
      });
      this.objectView.setPreview({
        definitionKey: object.definitionKey,
        x: this.hoveredCell.x,
        z: this.hoveredCell.z,
        rotation: object.rotation,
        valid: validation.valid,
      });
      return;
    }

    if (this.tool !== 'object') {
      this.objectView.setPreview(null);
      return;
    }

    const validation = this.objectMap.validatePlacement({
      definitionKey: this.selectedObjectKey,
      x: this.hoveredCell.x,
      z: this.hoveredCell.z,
      rotation: this.objectRotation,
    });
    this.objectView.setPreview({
      definitionKey: this.selectedObjectKey,
      x: this.hoveredCell.x,
      z: this.hoveredCell.z,
      rotation: this.objectRotation,
      valid: validation.valid,
    });
  }

  setSelectedObject(objectId) {
    const numericId = objectId === null || objectId === undefined ? null : Number(objectId);
    this.selectedObjectId = numericId && this.objectMap.getById(numericId) ? numericId : null;
    if (!this.selectedObjectId) {
      this.movingObjectId = null;
    }
    this.objectView.setSelection(this.selectedObjectId);
  }

  refreshObjects() {
    if (this.selectedObjectId && !this.objectMap.getById(this.selectedObjectId)) {
      this.selectedObjectId = null;
    }
    this.objectView.refreshAll();
    this.objectView.setSelection(this.selectedObjectId);
    this.updatePreviews();
    this.emitState();
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
    const object = cell ? this.objectMap.findAt(cell.x, cell.z) : null;
    const objectDefinition = object
      ? this.objectMap.getDefinition(object.definitionKey)
      : null;
    for (const listener of this.hoverListeners) {
      listener(cell ? { ...cell, tile, object, objectDefinition } : null);
    }
  }

  emitNotice(message, isError = false) {
    for (const listener of this.noticeListeners) {
      listener({ message, isError });
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
