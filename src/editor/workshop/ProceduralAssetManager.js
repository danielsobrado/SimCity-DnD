import { TILE_CATALOG } from '../tileCatalog.js';
import { disposeModelParts } from '../assets/modelParts.js';
import { unregisterProceduralDefinitions } from './ProceduralDefinitionLifecycle.js';
import { createProceduralMedievalParts } from './ProceduralMedievalGenerator.js';
import { ProceduralAssetStore } from './ProceduralAssetStore.js';

const TERRAIN_CLASSES = Object.freeze([
  'ocean', 'plains', 'forest', 'desert', 'wetland', 'tundra', 'ice',
  'road', 'stone', 'corruption',
]);

function definitionFor(record, tileSize) {
  const { recipe } = record;
  const manorLike = recipe.archetype === 'manor';
  const manorTowerRadius = Math.max(1.25, Math.min(2.15, recipe.width * 0.22));
  const manorDepth = Math.max(3.2, Math.min(7.5, recipe.depth * 2.2));
  const manorHasTower = manorLike && recipe.towerSide !== 'none';
  const radiusWidth = recipe.archetype === 'gatehouse'
    ? recipe.width + recipe.depth * 1.4
    : manorHasTower ? recipe.width + manorTowerRadius * 0.62 : recipe.width;
  const footprintWidth = Math.max(1, Math.ceil(radiusWidth / tileSize));
  const towerLike = recipe.archetype === 'tower' || recipe.archetype === 'square-tower';
  const footprintDepth = Math.max(1, Math.ceil(
    (
      towerLike
        ? recipe.width
        : manorLike
          ? manorDepth + (manorHasTower ? manorTowerRadius * 0.82 : 0)
          : recipe.depth
    ) / tileSize,
  ));
  return Object.freeze({
    key: record.key,
    label: record.label,
    icon: manorLike ? '🏡' : towerLike ? '🗼' : recipe.archetype === 'gatehouse' ? '🏯' : '🧱',
    category: 'workshop',
    color: recipe.finish === 'ochre'
      ? '#d9a13b'
      : recipe.finish === 'limewash'
        ? '#d9d0ae'
        : recipe.finish === 'rose'
          ? '#bb7564'
          : recipe.style === 'sandstone'
            ? '#b7774f'
            : recipe.style === 'limestone' ? '#b9a983' : '#858b8e',
    model: 'workshop',
    footprint: Object.freeze({ width: footprintWidth, depth: footprintDepth }),
    foundation: Object.freeze({
      mode: 'terrace',
      maxSlopeDegrees: 18,
      maxDepth: 4,
      alignToNormal: false,
      color: '#615b50',
    }),
    allowedTileIds: Object.freeze(TILE_CATALOG.map((tile) => tile.id).filter((id) => id !== 0)),
    allowedTerrainClasses: TERRAIN_CLASSES,
    procedural: true,
  });
}

export class ProceduralAssetManager {
  constructor({ tileSize, objectMap, objectView, ui }) {
    this.tileSize = tileSize;
    this.objectMap = objectMap;
    this.objectView = objectView;
    this.ui = ui;
    this.store = new ProceduralAssetStore();
    this.definitions = new Map();
  }

  create(input) {
    const previous = this.store.toDocument();
    try {
      const record = this.store.add(input);
      this.install(record);
      this.syncUi();
      return record;
    } catch (error) {
      this.restore(previous, error);
    }
  }

  createPreviewParts(recipe) {
    return createProceduralMedievalParts(recipe);
  }

  cleanupFailedInstall(definition, parts) {
    const renderer = this.objectView.renderers.get(definition.key);
    if (renderer?.parts === parts) {
      unregisterProceduralDefinitions({
        objectMap: this.objectMap,
        objectView: this.objectView,
        definitionKeys: [definition.key],
      });
      return;
    }
    const viewDefinition = this.objectView.definitionByKey.get(definition.key);
    if (viewDefinition?.procedural === true) {
      this.objectView.definitionByKey.delete(definition.key);
    }
    const mapDefinition = this.objectMap.definitionByKey.get(definition.key);
    if (mapDefinition?.procedural === true) {
      this.objectMap.definitionByKey.delete(definition.key);
    }
    disposeModelParts(parts);
  }

  install(record) {
    const definition = definitionFor(record, this.tileSize);
    const parts = createProceduralMedievalParts(record.recipe);
    try {
      this.objectMap.registerDefinition(definition);
      this.objectView.registerDefinition(definition, parts);
    } catch (error) {
      try {
        this.cleanupFailedInstall(definition, parts);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Failed to install or clean up procedural object ${definition.key}.`,
        );
      }
      throw error;
    }
    this.definitions.set(definition.key, definition);
    return definition;
  }

  clearInstalled() {
    unregisterProceduralDefinitions({
      objectMap: this.objectMap,
      objectView: this.objectView,
      definitionKeys: this.definitions.keys(),
    });
    this.definitions.clear();
  }

  rebuild(records) {
    this.clearInstalled();
    this.store.replaceAll(records ?? []);
    for (const record of this.store.list()) {
      this.install(record);
    }
    this.syncUi();
  }

  restore(previous, originalError) {
    try {
      this.rebuild(previous);
    } catch (rollbackError) {
      throw new AggregateError(
        [originalError, rollbackError],
        'The workshop asset change failed and could not be rolled back.',
      );
    }
    throw originalError;
  }

  replaceAll(records) {
    const previous = this.store.toDocument();
    try {
      this.rebuild(records ?? []);
    } catch (error) {
      this.restore(previous, error);
    }
  }

  syncUi() {
    this.ui.setProceduralObjectDefinitions(
      this.store.list().map((record) => this.definitions.get(record.key)).filter(Boolean),
    );
  }

  toDocument() {
    return this.store.toDocument();
  }
}
