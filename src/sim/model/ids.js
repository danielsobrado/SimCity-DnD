import { isEntityKind } from './entityKinds.js';

const IMPORTED_PREFIX = Object.freeze({
  regionState: 'region:azgaar-state:',
  regionProvince: 'region:azgaar-province:',
  settlement: 'settlement:azgaar-burg:',
  culture: 'culture:azgaar:',
  religion: 'religion:azgaar:',
  route: 'route:azgaar:',
  river: 'river:azgaar:',
});

export function importedRegionStateId(sourceId) {
  return `${IMPORTED_PREFIX.regionState}${String(sourceId)}`;
}

export function importedRegionProvinceId(sourceId) {
  return `${IMPORTED_PREFIX.regionProvince}${String(sourceId)}`;
}

export function importedSettlementId(sourceId) {
  return `${IMPORTED_PREFIX.settlement}${String(sourceId)}`;
}

export function importedCultureId(sourceId) {
  return `${IMPORTED_PREFIX.culture}${String(sourceId)}`;
}

export function importedReligionId(sourceId) {
  return `${IMPORTED_PREFIX.religion}${String(sourceId)}`;
}

export function importedRouteId(sourceId) {
  return `${IMPORTED_PREFIX.route}${String(sourceId)}`;
}

export function importedRiverId(sourceId) {
  return `${IMPORTED_PREFIX.river}${String(sourceId)}`;
}

export function generatedEntityId(kind, worldId, commandId, ordinal = 0) {
  if (!isEntityKind(kind)) {
    throw new Error(`invalid_entity_kind:${kind}`);
  }
  if (typeof worldId !== 'string' || worldId.length === 0) {
    throw new Error('invalid_world_id');
  }
  if (typeof commandId !== 'string' || commandId.length === 0) {
    throw new Error('invalid_command_id');
  }
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    throw new Error('invalid_ordinal');
  }
  return `${kind}:generated:${worldId}:${commandId}:${ordinal}`;
}

export function isStableEntityId(id) {
  return typeof id === 'string' && id.length > 0 && !id.includes('undefined') && !id.includes('null');
}

export function parseGeneratedEntityId(id) {
  if (typeof id !== 'string') return null;
  const parts = id.split(':');
  if (parts.length < 5 || parts[1] !== 'generated') return null;
  const [kind, , worldId, commandId, ordinalRaw] = parts;
  const ordinal = Number(ordinalRaw);
  if (!isEntityKind(kind) || !Number.isInteger(ordinal)) return null;
  return { kind, worldId, commandId, ordinal };
}
