import { EditorController } from './EditorController.js';
import { evaluateObjectSurface } from './TerrainPlacement.js';
import { createWorldDocument, loadWorldDocument } from './WorldDocument.js';
import { worldToCell } from './world/WorldCoordinates.js';

function cloneCampaign(campaign) {
  return campaign ? structuredClone(campaign) : null;
}

export class TerrainAwareEditorController extends EditorController {
  constructor(options) {
    super(options);
    this.voxelStampStore = options.voxelStampStore ?? null;
    this.worldStore = options.worldStore ?? options.tileMap?.worldStore ?? null;
    this.campaign = null;
    this.importWarnings = [];
    this.focusProvider = null;
  }

  getState() {
    return {
      ...super.getState(),
      voxelStampCount: this.voxelStampStore?.size ?? 0,
      worldStats: this.worldStore?.getStats() ?? null,
      campaignSource: this.campaign?.source ?? null,
    };
  }

  getFocusCell() {
    const canonical = this.focusProvider
      ? this.focusProvider()
      : (() => {
        const renderFocus = this.editorCamera.getFocusWorld();
        return this.terrainView.floatingOrigin
          ? this.terrainView.floatingOrigin.toCanonical(renderFocus.x, renderFocus.z)
          : renderFocus;
      })();
    return worldToCell(canonical.x, canonical.z, this.tileMap.tileSize);
  }

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

  addVoxelStamp(input) {
    if (!this.voxelStampStore) {
      throw new Error('Voxel stamp storage is unavailable.');
    }
    const after = this.voxelStampStore.add(input);
    this.commitHistory({ kind: 'voxel-stamp', before: null, after });
    this.emitMap();
    return after;
  }

  clearVoxelStamps() {
    if (!this.voxelStampStore) {
      return;
    }
    const before = this.voxelStampStore.clear();
    if (before.length === 0) {
      return;
    }
    this.commitHistory({ kind: 'voxel-stamps', before, after: [] });
    this.emitMap();
  }

  applyHistory(entry, direction) {
    if (entry.kind === 'voxel-stamp') {
      this.voxelStampStore.applyChange(entry, direction);
      return;
    }
    if (entry.kind === 'voxel-stamps') {
      this.voxelStampStore.replaceAll(direction === 'undo' ? entry.before : entry.after);
      return;
    }
    if (entry.kind === 'infinite-world') {
      this.worldStore.restoreSnapshot(
        direction === 'undo' ? entry.beforeWorld : entry.afterWorld,
      );
      this.objectMap.replaceAll(
        direction === 'undo' ? entry.beforeObjects : entry.afterObjects,
      );
      this.voxelStampStore?.replaceAll(
        direction === 'undo' ? entry.beforeVoxelStamps : entry.afterVoxelStamps,
      );
      this.campaign = cloneCampaign(
        direction === 'undo' ? entry.beforeCampaign : entry.afterCampaign,
      );
      this.importWarnings = direction === 'undo'
        ? [...(entry.beforeImportWarnings ?? [])]
        : [...(entry.afterImportWarnings ?? [])];
      this.setSelectedObject(null);
      this.terrainView.refreshAll();
      this.refreshObjects();
      return;
    }

    super.applyHistory(entry, direction);
    if (entry.kind === 'world' && this.voxelStampStore) {
      this.voxelStampStore.replaceAll(
        direction === 'undo' ? entry.beforeVoxelStamps : entry.afterVoxelStamps,
      );
    }
  }

  clearWorld() {
    if (this.worldStore) {
      const beforeWorld = this.worldStore.createSnapshot();
      const beforeObjects = this.objectMap.clear();
      const beforeVoxelStamps = this.voxelStampStore?.clear() ?? [];
      const beforeCampaign = cloneCampaign(this.campaign);
      const beforeImportWarnings = [...this.importWarnings];
      if (beforeWorld.tileOverrides.length === 0
          && beforeWorld.heightOverrides.length === 0
          && beforeObjects.length === 0
          && beforeVoxelStamps.length === 0
          && !beforeCampaign) {
        return;
      }
      this.worldStore.clearOverrides();
      this.campaign = null;
      this.importWarnings = [];
      const afterWorld = this.worldStore.createSnapshot();
      this.commitHistory({
        kind: 'infinite-world',
        beforeWorld,
        afterWorld,
        beforeObjects,
        afterObjects: [],
        beforeVoxelStamps,
        afterVoxelStamps: [],
        beforeCampaign,
        afterCampaign: null,
        beforeImportWarnings,
        afterImportWarnings: [],
      });
      this.setSelectedObject(null);
      this.terrainView.refreshAll();
      this.refreshObjects();
      this.emitMap();
      return;
    }

    const beforeObjects = this.objectMap.clear();
    const terrainPatch = this.tileMap.fill(0);
    const heightPatch = this.heightField.fill(0);
    const beforeVoxelStamps = this.voxelStampStore?.clear() ?? [];
    if (beforeObjects.length === 0
        && terrainPatch.indices.length === 0
        && heightPatch.indices.length === 0
        && beforeVoxelStamps.length === 0) {
      return;
    }

    this.commitHistory({
      kind: 'world',
      terrainPatch,
      heightPatch,
      beforeObjects,
      afterObjects: [],
      beforeVoxelStamps,
      afterVoxelStamps: [],
    });
    this.setSelectedObject(null);
    this.terrainView.updatePatch(terrainPatch);
    this.terrainView.updateHeightPatch(heightPatch);
    this.refreshObjects();
    this.emitMap();
  }

  toDocument() {
    return {
      ...createWorldDocument(
        this.tileMap,
        this.heightField,
        this.objectMap,
        this.voxelStampStore,
      ),
      ...(this.campaign ? { campaign: cloneCampaign(this.campaign) } : {}),
      ...(this.importWarnings.length > 0 ? { importWarnings: [...this.importWarnings] } : {}),
    };
  }

  loadDocument(document) {
    loadWorldDocument(
      document,
      this.tileMap,
      this.heightField,
      this.objectMap,
      this.voxelStampStore,
      () => this.validateLoadedObjectSurfaces(),
    );
    this.campaign = cloneCampaign(document.campaign);
    this.importWarnings = Array.isArray(document.importWarnings)
      ? [...document.importWarnings]
      : [];
    this.terrainView.refreshAll();
    this.refreshObjects();
    this.undoStack = [];
    this.redoStack = [];
    this.setSelectedObject(null);
    if (this.importWarnings.length > 0) {
      this.emitNotice(this.importWarnings.join(' '));
    }
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
