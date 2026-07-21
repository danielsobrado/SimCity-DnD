import { EditorController } from './EditorController.js';
import { evaluateObjectSurface } from './TerrainPlacement.js';
import { loadWorldDocument } from './WorldDocument.js';

export class TerrainAwareEditorController extends EditorController {
  validateObjectPlacement({ definitionKey, x, z, rotation, ignoreObjectId = null }) {
    const objectValidation = this.objectMap.validatePlacement({
      definitionKey,
      x,
      z,
      rotation,
      ignoreObjectId,
    });
    if (!objectValidation.valid) {
      return objectValidation;
    }

    const definition = this.objectMap.getDefinition(definitionKey);
    const bounds = this.objectMap.getBounds(x, z, definitionKey, rotation);
    return evaluateObjectSurface({
      definition,
      heightField: this.heightField,
      bounds,
      tileSize: this.tileMap.tileSize,
    });
  }

  rotateSelected() {
    const before = this.selectedObjectId
      ? this.objectMap.getById(this.selectedObjectId)
      : null;
    if (!before) {
      return;
    }

    const rotation = before.rotation + 1;
    const validation = this.validateObjectPlacement({
      definitionKey: before.definitionKey,
      x: before.x,
      z: before.z,
      rotation,
      ignoreObjectId: before.id,
    });
    if (!validation.valid) {
      this.emitNotice(validation.reason, true);
      return;
    }

    try {
      const after = this.objectMap.transform(before.id, {
        x: before.x,
        z: before.z,
        rotation,
      });
      this.commitHistory({ kind: 'object', before, after });
      this.refreshObjects();
      this.emitMap();
    } catch (error) {
      this.emitNotice(error.message, true);
    }
  }

  loadDocument(document) {
    loadWorldDocument(
      document,
      this.tileMap,
      this.heightField,
      this.objectMap,
      () => this.validateLoadedObjectSurfaces(),
    );
    this.terrainView.refreshAll();
    this.refreshObjects();
    this.undoStack = [];
    this.redoStack = [];
    this.setSelectedObject(null);
    this.emitMap();
    this.emitState();
  }

  validateLoadedObjectSurfaces() {
    for (const object of this.objectMap.list()) {
      const validation = this.validateObjectPlacement({
        definitionKey: object.definitionKey,
        x: object.x,
        z: object.z,
        rotation: object.rotation,
        ignoreObjectId: object.id,
      });
      if (!validation.valid) {
        throw new Error(`Object ${object.id} has invalid terrain support: ${validation.reason}`);
      }
    }
  }
}
