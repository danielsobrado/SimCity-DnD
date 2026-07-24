import { ENTITY_KINDS } from './entityKinds.js';
import { createEntityEnvelope } from './entityEnvelope.js';

const COLLECTION_BY_KIND = Object.freeze({
  region: 'regions',
  settlement: 'settlements',
  populationCohort: 'populations',
  market: 'markets',
  resourceSite: 'resourceSites',
  route: 'routes',
  faction: 'factions',
  shipment: 'shipments',
  party: 'parties',
  encounterSite: 'encounters',
  conflict: 'conflicts',
  contract: 'contracts',
  worldEvent: 'worldEvents',
  inventoryAccount: 'inventories',
  facility: 'facilities',
  tradeOffer: 'tradeOffers',
  carrier: 'carriers',
  character: 'characters',
  opportunity: 'opportunities',
  militaryCompany: 'militaryCompanies',
  graphNode: 'graphNodes',
  graphEdge: 'graphEdges',
});

export function collectionNameForKind(kind) {
  const name = COLLECTION_BY_KIND[kind];
  if (!name) throw Object.assign(new Error(`unknown_kind:${kind}`), { code: 'invalid_entity_kind' });
  return name;
}

export function createEmptyWorldState({
  calendar = { tick: 0, year: 1, month: 1, day: 1, hour: 8, minute: 0 },
  revision = 0,
} = {}) {
  const collections = {};
  for (const kind of ENTITY_KINDS) {
    collections[collectionNameForKind(kind)] = new Map();
  }
  return {
    calendar: { ...calendar },
    revision,
    diagnostics: {
      commandsAccepted: 0,
      commandsRejected: 0,
      eventsEmitted: 0,
      eventsApplied: 0,
      validationFailures: {},
    },
    ...collections,
  };
}

export function cloneWorldState(state) {
  const next = createEmptyWorldState({
    calendar: { ...state.calendar },
    revision: state.revision,
  });
  next.diagnostics = structuredClone(state.diagnostics);
  for (const kind of ENTITY_KINDS) {
    const key = collectionNameForKind(kind);
    for (const [id, entity] of state[key]) {
      next[key].set(id, structuredClone(entity));
    }
  }
  return next;
}

export function putEntity(state, entity) {
  const key = collectionNameForKind(entity.kind);
  if (state[key].has(entity.id)) {
    throw Object.assign(new Error(`duplicate_entity_id:${entity.id}`), { code: 'duplicate_entity_id' });
  }
  state[key].set(entity.id, entity);
  return entity;
}

export function upsertEntity(state, entity) {
  const key = collectionNameForKind(entity.kind);
  state[key].set(entity.id, entity);
  return entity;
}

export function getEntity(state, kind, id) {
  return state[collectionNameForKind(kind)].get(id) ?? null;
}

export function requireEntity(state, kind, id) {
  const entity = getEntity(state, kind, id);
  if (!entity) {
    throw Object.assign(new Error(`missing_reference:${kind}:${id}`), { code: 'missing_reference' });
  }
  return entity;
}

export function listEntities(state, kind, { includeDestroyed = true } = {}) {
  const entities = [...state[collectionNameForKind(kind)].values()];
  entities.sort((a, b) => a.id.localeCompare(b.id));
  if (includeDestroyed) return entities;
  return entities.filter((e) => e.status === 'active');
}

export function createAndPutEntity(state, fields) {
  const entity = createEntityEnvelope(fields);
  return putEntity(state, entity);
}

export { COLLECTION_BY_KIND };
