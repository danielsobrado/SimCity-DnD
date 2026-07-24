import { TILE_CATALOG } from '../tileCatalog.js';
import { disposeModelParts } from '../assets/modelParts.js';
import { createProceduralMedievalParts } from './ProceduralMedievalGenerator.js';
import { ProceduralAssetStore } from './ProceduralAssetStore.js';

const TERRAIN_CLASSES = Object.freeze([
  'ocean', 'plains', 'forest', 'desert', 'wetland', 'tundra', 'ice',
  'road', 'stone', 'corruption',
]);

function definitionFor(record, tileSize) {
  const { recipe } = record;
  const radiusWidth = recipe.archetype === 'gatehouse'
    ? recipe.width + recipe.depth * 1.4
    : recipe.width;
  const footprintWidth = Math.max(1, Math.ceil(radiusWidth / tileSize));
  const towerLike = recipe.archetype === 'tower' || recipe.archetype === 'square-tower';
  const footprintDepth = Math.max(1, Math.ceil(
    (towerLike ? recipe.width : recipe.depth) / tileSize,
  ));
  return Object.freeze({
    key: record.key,
    label: record.label,
    icon: towerLike ? '🗼' : recipe.archetype === 'gatehouse' ? '🏯' : '🧱',
    category: 'workshop',
    color: recipe.style === 'sandstone'
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
    const record = this.store.add(input);
    this.install(record);
    this.syncUi();
    return record;
  }

  createPreviewParts(recipe) {
    return createProceduralMedievalParts(recipe);
  }

  install(record) {
    const definition = definitionFor(record, this.tileSize);
    const parts = createProceduralMedievalParts(record.recipe);
    try {
      this.objectMap.registerDefinition(definition);
      this.objectView.registerDefinition(definition, parts);
    } catch (error) {
      disposeModelParts(parts);
      throw error;
    }
    this.definitions.set(definition.key, definition);
    return definition;
  }

  replaceAll(records) {
    const previous = this.store.toDocument();
    try {
      this.store.replaceAll(records ?? []);
      for (const record of this.store.list()) {
        this.install(record);
      }
      this.syncUi();
    } catch (error) {
      this.store.replaceAll(previous);
      for (const record of this.store.list()) {
        this.install(record);
      }
      this.syncUi();
      throw error;
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
