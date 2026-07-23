import { AZGAAR_STANDARD_BIOMES } from './AzgaarBiomeCatalog.js';

const BIOME_SHORTCUTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

const AZGAAR_TILES = AZGAAR_STANDARD_BIOMES.map((biome) => Object.freeze({
  id: biome.tileId,
  key: biome.key.replace(/^azgaar_/, ''),
  label: biome.name,
  shortcut: BIOME_SHORTCUTS[biome.sourceId] ?? '',
  color: biome.color,
  icon: biome.icon,
  terrainClass: biome.terrainClass,
  supportsGrass: biome.supportsGrass,
  supportsTrees: biome.supportsTrees,
  azgaarSourceId: biome.sourceId,
}));

const EDITOR_TILES = [
  {
    id: 13,
    key: 'road',
    label: 'Road',
    shortcut: '',
    color: '#8b7659',
    icon: '🛤️',
    terrainClass: 'road',
  },
  {
    id: 14,
    key: 'farm',
    label: 'Farm',
    shortcut: '',
    color: '#b89b42',
    icon: '🌾',
    terrainClass: 'plains',
  },
  {
    id: 15,
    key: 'stone',
    label: 'Stone',
    shortcut: '',
    color: '#777d7d',
    icon: '🪨',
    terrainClass: 'stone',
  },
  {
    id: 16,
    key: 'corruption',
    label: 'Corruption',
    shortcut: '',
    color: '#6b3c78',
    icon: '🔮',
    terrainClass: 'corruption',
  },
].map(Object.freeze);

export const TILE_CATALOG = Object.freeze([...AZGAAR_TILES, ...EDITOR_TILES]);

export const TILE_BY_ID = new Map(TILE_CATALOG.map((tile) => [tile.id, tile]));
export const TILE_BY_KEY = new Map(TILE_CATALOG.map((tile) => [tile.key, tile]));
export const TILE_BY_SHORTCUT = new Map(
  TILE_CATALOG
    .filter((tile) => tile.shortcut)
    .map((tile) => [tile.shortcut, tile]),
);

export function hexToRgbBytes(hexColor) {
  const normalized = hexColor.replace('#', '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}
