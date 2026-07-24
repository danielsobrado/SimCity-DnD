/**
 * Deterministic mulberry32 PRNG. Authoritative simulation must never use non-seeded RNG APIs.
 */
export function createSeededRng(seed) {
  let state = (Number(seed) >>> 0) || 1;
  function nextUint32() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  return {
    nextUint32,
    nextFloat() {
      return nextUint32() / 0x100000000;
    },
    nextInt(minInclusive, maxExclusive) {
      const span = maxExclusive - minInclusive;
      if (!Number.isInteger(span) || span <= 0) {
        throw new Error('invalid_rng_range');
      }
      return minInclusive + (nextUint32() % span);
    },
    fork(label) {
      const labelHash = hashString(`${seed}:${label}`);
      return createSeededRng(labelHash);
    },
  };
}

export function hashString(value) {
  let h = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
