export function isTreeImpostorBakeMode(locationValue = globalThis.location) {
  if (!locationValue?.search) return false;
  return new URLSearchParams(locationValue.search).get('bakeImpostors') === '1';
}
