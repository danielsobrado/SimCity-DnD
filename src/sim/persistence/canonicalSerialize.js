function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deterministic JSON with sorted object keys and Map/Set normalized forms.
 */
export function canonicalSerialize(value) {
  return JSON.stringify(canonicalize(value));
}

export function canonicalize(value) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('non_finite_number');
    }
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Map) {
    return canonicalize([...value.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
  }
  if (value instanceof Set) {
    return canonicalize([...value].sort((a, b) => String(a).localeCompare(String(b))));
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  throw new Error(`unsupported_serialize_type:${typeof value}`);
}

export function checksumCanonical(value) {
  const text = canonicalSerialize(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (`00000000${(h >>> 0).toString(16)}`).slice(-8);
}
