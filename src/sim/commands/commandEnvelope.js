export function createCommandEnvelope({
  id,
  type,
  issuedAtTick,
  actorId = 'system',
  expectedWorldRevision = null,
  payload = {},
  source = 'system',
}) {
  if (typeof id !== 'string' || id.length === 0) {
    throw Object.assign(new Error('invalid_command_id'), { code: 'invalid_command_id' });
  }
  if (typeof type !== 'string' || type.length === 0) {
    throw Object.assign(new Error('invalid_command_type'), { code: 'invalid_command_type' });
  }
  if (!Number.isInteger(issuedAtTick) || issuedAtTick < 0) {
    throw Object.assign(new Error('invalid_issued_at_tick'), { code: 'invalid_issued_at_tick' });
  }
  return Object.freeze({
    id,
    type,
    issuedAtTick,
    actorId: String(actorId),
    expectedWorldRevision,
    payload: clonePlain(payload),
    source: String(source),
  });
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
