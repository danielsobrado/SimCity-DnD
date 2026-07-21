export const TILE_CATALOG = Object.freeze([
  { id: 0, key: 'plains', label: 'Plains', shortcut: '1', color: '#769d4e', icon: '🌿' },
  { id: 1, key: 'forest', label: 'Forest', shortcut: '2', color: '#315f3a', icon: '🌲' },
  { id: 2, key: 'water', label: 'Water', shortcut: '3', color: '#367aa8', icon: '🌊' },
  { id: 3, key: 'road', label: 'Road', shortcut: '4', color: '#8b7659', icon: '🛤️' },
  { id: 4, key: 'farm', label: 'Farm', shortcut: '5', color: '#b89b42', icon: '🌾' },
  { id: 5, key: 'stone', label: 'Stone', shortcut: '6', color: '#777d7d', icon: '🪨' },
  { id: 6, key: 'desert', label: 'Desert', shortcut: '7', color: '#c9a55b', icon: '🏜️' },
  { id: 7, key: 'swamp', label: 'Swamp', shortcut: '8', color: '#596a3b', icon: '🪷' },
  { id: 8, key: 'snow', label: 'Snow', shortcut: '9', color: '#d9e5e8', icon: '❄️' },
  { id: 9, key: 'corruption', label: 'Corruption', shortcut: '0', color: '#6b3c78', icon: '🔮' },
]);

export const TILE_BY_ID = new Map(TILE_CATALOG.map((tile) => [tile.id, tile]));
export const TILE_BY_KEY = new Map(TILE_CATALOG.map((tile) => [tile.key, tile]));
export const TILE_BY_SHORTCUT = new Map(TILE_CATALOG.map((tile) => [tile.shortcut, tile]));

export function hexToRgbBytes(hexColor) {
  const normalized = hexColor.replace('#', '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}
