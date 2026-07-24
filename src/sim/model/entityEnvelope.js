import { isEntityKind, isEntityStatus } from './entityKinds.js';
import { isStableEntityId } from './ids.js';

export function createEntityEnvelope({
  id,
  kind,
  revision = 0,
  createdAtTick = 0,
  updatedAtTick = 0,
  status = 'active',
  tags = [],
  data = {},
}) {
  if (!isStableEntityId(id)) {
    throw Object.assign(new Error('invalid_entity_id'), { code: 'invalid_entity_id' });
  }
  if (!isEntityKind(kind)) {
    throw Object.assign(new Error(`invalid_entity_kind:${kind}`), { code: 'invalid_entity_kind' });
  }
  if (!isEntityStatus(status)) {
    throw Object.assign(new Error(`invalid_entity_status:${status}`), { code: 'invalid_entity_status' });
  }
  if (!Number.isInteger(revision) || revision < 0) {
    throw Object.assign(new Error('invalid_revision'), { code: 'invalid_revision' });
  }
  if (!Number.isInteger(createdAtTick) || createdAtTick < 0) {
    throw Object.assign(new Error('invalid_created_at_tick'), { code: 'invalid_created_at_tick' });
  }
  if (!Number.isInteger(updatedAtTick) || updatedAtTick < 0) {
    throw Object.assign(new Error('invalid_updated_at_tick'), { code: 'invalid_updated_at_tick' });
  }
  return {
    id,
    kind,
    revision,
    createdAtTick,
    updatedAtTick,
    status,
    tags: Object.freeze([...tags].map(String).sort()),
    data: structuredClone(data),
  };
}

export function bumpEntity(entity, tick, dataPatch = null, status = null) {
  return {
    ...entity,
    revision: entity.revision + 1,
    updatedAtTick: tick,
    status: status ?? entity.status,
    data: dataPatch == null ? entity.data : { ...entity.data, ...dataPatch },
    tags: entity.tags,
  };
}
