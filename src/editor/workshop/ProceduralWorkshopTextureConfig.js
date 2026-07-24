const MAX_SOURCE_COUNT = 4;
const MAX_SOURCE_INPUT_COUNT = 8;
const MAX_SOURCE_DATA_URL_LENGTH = 800_000;
const MAX_TOTAL_DATA_URL_LENGTH = 2_400_000;
const VALID_SOURCE_ID = /^albedo-[a-z0-9-]+$/;
const VALID_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
const VALID_TINT = /^#[0-9a-f]{6}$/i;
const VALID_MAPPINGS = new Set(['repeat', 'mirror', 'clamp']);
const VALID_ROTATIONS = new Set([0, 90, 180, 270]);

export const WORKSHOP_SURFACE_TEXTURE_SLOTS = Object.freeze([
  Object.freeze({ key: 'walls', label: 'Walls', repeat: 2 }),
  Object.freeze({ key: 'stone', label: 'Stone trim', repeat: 1.5 }),
  Object.freeze({ key: 'roof', label: 'Roof', repeat: 4 }),
  Object.freeze({ key: 'wood', label: 'Doors & wood', repeat: 2 }),
]);

const SLOT_KEYS = new Set(WORKSHOP_SURFACE_TEXTURE_SLOTS.map(({ key }) => key));
const SLOT_BY_KEY = new Map(WORKSHOP_SURFACE_TEXTURE_SLOTS.map((slot) => [slot.key, slot]));

function requireObject(value, field) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value;
}

function requireFinite(value, field, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function normalizeSource(id, input) {
  if (!VALID_SOURCE_ID.test(id)) {
    throw new Error(`Invalid workshop albedo source id: ${id}.`);
  }
  const source = requireObject(input, `Albedo source ${id}`);
  const dataUrl = String(source.dataUrl ?? '');
  if (!VALID_DATA_URL.test(dataUrl)) {
    throw new Error('Workshop albedo textures must be PNG, JPEG, or WebP images.');
  }
  if (dataUrl.length > MAX_SOURCE_DATA_URL_LENGTH) {
    throw new Error('A workshop albedo texture is too large after processing.');
  }
  return Object.freeze({
    name: String(source.name ?? 'Imported texture').trim().slice(0, 80) || 'Imported texture',
    dataUrl,
  });
}

function normalizeSlot(key, input, sources) {
  if (!SLOT_KEYS.has(key)) {
    throw new Error(`Unknown workshop material area: ${key}.`);
  }
  const slot = requireObject(input, `Material area ${key}`);
  const sourceId = String(slot.sourceId ?? '');
  if (!sources[sourceId]) {
    throw new Error(`Material area ${key} references a missing albedo source.`);
  }
  const mapping = String(slot.mapping ?? 'repeat');
  if (!VALID_MAPPINGS.has(mapping)) {
    throw new Error(`Unknown albedo mapping mode: ${mapping}.`);
  }
  const rotation = Number(slot.rotation ?? 0);
  if (!VALID_ROTATIONS.has(rotation)) {
    throw new Error('Albedo rotation must be 0, 90, 180, or 270 degrees.');
  }
  const tint = String(slot.tint ?? '#ffffff').toLowerCase();
  if (!VALID_TINT.test(tint)) {
    throw new Error('Albedo tint must be a six-digit hex color.');
  }
  return Object.freeze({
    sourceId,
    mapping,
    repeat: requireFinite(slot.repeat ?? SLOT_BY_KEY.get(key).repeat, 'Albedo repeat', 0.25, 8),
    rotation,
    tint,
  });
}

export function createSurfaceTextureSourceId(dataUrl) {
  const value = String(dataUrl);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `albedo-${(hash >>> 0).toString(36)}-${value.length.toString(36)}`;
}

export function getSurfaceTextureDefaults(slotKey) {
  const slot = SLOT_BY_KEY.get(slotKey);
  if (!slot) {
    throw new Error(`Unknown workshop material area: ${slotKey}.`);
  }
  return {
    mapping: 'repeat',
    repeat: slot.repeat,
    rotation: 0,
    tint: '#ffffff',
  };
}

export function normalizeSurfaceTextures(input = {}) {
  const config = requireObject(input, 'Workshop surface textures');
  const sourceInputs = requireObject(config.sources, 'Workshop albedo sources');
  const slotInputs = requireObject(config.slots, 'Workshop material areas');

  const rawSourceEntries = Object.entries(sourceInputs);
  if (rawSourceEntries.length > MAX_SOURCE_INPUT_COUNT) {
    throw new Error('The workshop albedo source library contains too many entries.');
  }

  const allSources = {};
  for (const [id, sourceInput] of rawSourceEntries) {
    allSources[id] = normalizeSource(id, sourceInput);
  }

  const slots = {};
  const usedSourceIds = new Set();
  for (const [key, slotInput] of Object.entries(slotInputs)) {
    const slot = normalizeSlot(key, slotInput, allSources);
    slots[key] = slot;
    usedSourceIds.add(slot.sourceId);
  }

  if (usedSourceIds.size > MAX_SOURCE_COUNT) {
    throw new Error(`The workshop supports at most ${MAX_SOURCE_COUNT} imported albedo textures per object.`);
  }
  const sources = {};
  let totalLength = 0;
  for (const sourceId of usedSourceIds) {
    const source = allSources[sourceId];
    totalLength += source.dataUrl.length;
    sources[sourceId] = source;
  }
  if (totalLength > MAX_TOTAL_DATA_URL_LENGTH) {
    throw new Error('The imported albedo textures are too large for one workshop object.');
  }

  return Object.freeze({
    sources: Object.freeze(sources),
    slots: Object.freeze(slots),
  });
}

export function serializeSurfaceTextures(input = {}) {
  const normalized = normalizeSurfaceTextures(input);
  return {
    sources: Object.fromEntries(
      Object.entries(normalized.sources).map(([id, source]) => [id, { ...source }]),
    ),
    slots: Object.fromEntries(
      Object.entries(normalized.slots).map(([key, slot]) => [key, { ...slot }]),
    ),
  };
}

export function getSurfaceTexture(input, slotKey) {
  const slot = input?.slots?.[slotKey];
  if (!slot) return null;
  const source = input?.sources?.[slot.sourceId];
  return source ? { slot, source } : null;
}
