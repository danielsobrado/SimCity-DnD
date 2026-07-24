import { ENTITY_KINDS } from '../entityKinds.js';
import { collectionNameForKind, listEntities } from '../worldState.js';

const REFERENCE_RULES = Object.freeze([
  { kind: 'settlement', path: ['data', 'regionId'], refKind: 'region' },
  { kind: 'settlement', path: ['data', 'provinceId'], refKind: 'region', optional: true },
  { kind: 'settlement', path: ['data', 'stateId'], refKind: 'region', optional: true },
  { kind: 'populationCohort', path: ['data', 'settlementId'], refKind: 'settlement' },
  { kind: 'market', path: ['data', 'settlementId'], refKind: 'settlement' },
  { kind: 'facility', path: ['data', 'settlementId'], refKind: 'settlement' },
  { kind: 'inventoryAccount', path: ['data', 'ownerEntityId'], refKind: null },
  { kind: 'shipment', path: ['data', 'originSettlementId'], refKind: 'settlement' },
  { kind: 'shipment', path: ['data', 'destinationSettlementId'], refKind: 'settlement' },
  { kind: 'route', path: ['data', 'fromSettlementId'], refKind: 'settlement', optional: true },
  { kind: 'route', path: ['data', 'toSettlementId'], refKind: 'settlement', optional: true },
  { kind: 'contract', path: ['data', 'settlementId'], refKind: 'settlement', optional: true },
  { kind: 'faction', path: ['data', 'homeRegionId'], refKind: 'region', optional: true },
  { kind: 'graphEdge', path: ['data', 'fromNodeId'], refKind: 'graphNode' },
  { kind: 'graphEdge', path: ['data', 'toNodeId'], refKind: 'graphNode' },
]);

function readPath(obj, path) {
  return path.reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

export function validateWorldState(state) {
  const failures = [];
  const seen = new Set();

  for (const kind of ENTITY_KINDS) {
    for (const entity of listEntities(state, kind, { includeDestroyed: true })) {
      if (seen.has(entity.id)) {
        failures.push({ code: 'duplicate_entity_id', entityId: entity.id, kind });
      }
      seen.add(entity.id);
      if (entity.kind !== kind) {
        failures.push({ code: 'invalid_entity_kind', entityId: entity.id, kind: entity.kind });
      }
    }
  }

  for (const rule of REFERENCE_RULES) {
    for (const entity of listEntities(state, rule.kind, { includeDestroyed: true })) {
      const refId = readPath(entity, rule.path);
      if (refId == null || refId === '') {
        if (!rule.optional) {
          failures.push({
            code: 'missing_reference',
            entityId: entity.id,
            path: rule.path.join('.'),
          });
        }
        continue;
      }
      if (rule.refKind) {
        const collection = state[collectionNameForKind(rule.refKind)];
        if (!collection.has(refId)) {
          failures.push({
            code: 'missing_reference',
            entityId: entity.id,
            path: rule.path.join('.'),
            refId,
            refKind: rule.refKind,
          });
        }
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

export function recordValidationFailure(state, code) {
  const bucket = state.diagnostics.validationFailures;
  bucket[code] = (bucket[code] ?? 0) + 1;
}
