export const MAP_FORMAT_VERSION = 5;
export const LEGACY_MAP_FORMAT_VERSION = 1;
export const INTERMEDIATE_MAP_FORMAT_VERSION = 2;
export const HEIGHTFIELD_MAP_FORMAT_VERSION = 3;
export const VOXEL_STAMP_MAP_FORMAT_VERSION = 4;
export const SUPPORTED_MAP_FORMAT_VERSIONS = Object.freeze([
  LEGACY_MAP_FORMAT_VERSION,
  INTERMEDIATE_MAP_FORMAT_VERSION,
  HEIGHTFIELD_MAP_FORMAT_VERSION,
  VOXEL_STAMP_MAP_FORMAT_VERSION,
  MAP_FORMAT_VERSION,
]);
export const MAX_HISTORY_ENTRIES = 100;
export const PRIMARY_POINTER_BUTTON = 0;
export const MINIMAP_SIZE = 192;
export const PAINT_INTERVAL_MS = 24;
export const QUARTER_TURN_RADIANS = Math.PI / 2;
export const VALID_EDITOR_TOOLS = Object.freeze(['terrain', 'object', 'select']);
export const VALID_TERRAIN_MODES = Object.freeze(['paint', 'raise', 'lower', 'smooth']);
export const ELEVATED_PLACEMENT_TOLERANCE = 0.05;
export const TERRAIN_MODE_BY_SHORTCUT = Object.freeze({
  p: 'paint',
  u: 'raise',
  j: 'lower',
  k: 'smooth',
});
export const TERRAIN_PREVIEW_COLORS = Object.freeze({
  raise: '#76d17e',
  lower: '#d16f6f',
  smooth: '#6faed1',
});
