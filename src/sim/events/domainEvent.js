export function createDomainEvent({
  id,
  type,
  tick,
  causedByCommandId,
  entityIds = [],
  payload = {},
  schemaVersion = 1,
}) {
  if (typeof id !== 'string' || id.length === 0) {
    throw Object.assign(new Error('invalid_event_id'), { code: 'invalid_event_id' });
  }
  if (typeof type !== 'string' || type.length === 0) {
    throw Object.assign(new Error('invalid_event_type'), { code: 'invalid_event_type' });
  }
  if (!Number.isInteger(tick) || tick < 0) {
    throw Object.assign(new Error('invalid_event_tick'), { code: 'invalid_event_tick' });
  }
  return Object.freeze({
    id,
    type,
    tick,
    causedByCommandId: String(causedByCommandId),
    entityIds: Object.freeze([...entityIds].map(String).sort()),
    payload: clonePlain(stripPrivate(payload)),
    schemaVersion,
  });
}

function stripPrivate(payload) {
  if (payload == null || typeof payload !== 'object') return payload;
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key.startsWith('__')) continue;
    out[key] = value;
  }
  return out;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
