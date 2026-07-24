export const ENTITY_KINDS = Object.freeze([
  'region',
  'settlement',
  'populationCohort',
  'market',
  'resourceSite',
  'route',
  'faction',
  'shipment',
  'party',
  'encounterSite',
  'conflict',
  'contract',
  'worldEvent',
  'inventoryAccount',
  'facility',
  'tradeOffer',
  'carrier',
  'character',
  'opportunity',
  'militaryCompany',
  'graphNode',
  'graphEdge',
]);

export const ENTITY_KIND_SET = new Set(ENTITY_KINDS);

export const ENTITY_STATUSES = Object.freeze([
  'active',
  'inactive',
  'destroyed',
  'archived',
]);

export const ENTITY_STATUS_SET = new Set(ENTITY_STATUSES);

export function isEntityKind(value) {
  return ENTITY_KIND_SET.has(value);
}

export function isEntityStatus(value) {
  return ENTITY_STATUS_SET.has(value);
}
