import { PerfCounters } from '../performance/qa/PerfCounters.js';

/**
 * Mark a BufferAttribute dirty for only the used float/element range.
 * Three.js WebGPU honors `updateRanges` via `queue.writeBuffer` partial uploads.
 *
 * @param {import('three').BufferAttribute} attribute
 * @param {number} usedCount Number of logical elements (vertices/instances), not floats.
 * @param {{ counter?: string }} [options]
 */
export function markAttributeRangeUpdated(attribute, usedCount, { counter = 'attributeBytesUploaded' } = {}) {
  const count = Math.max(0, Math.floor(usedCount));
  const floats = count * attribute.itemSize;
  attribute.clearUpdateRanges();
  if (floats > 0) {
    attribute.addUpdateRange(0, floats);
  }
  attribute.needsUpdate = true;
  const bytes = floats * (attribute.array?.BYTES_PER_ELEMENT ?? 4);
  if (bytes > 0) {
    PerfCounters.inc(counter, bytes);
  }
  return bytes;
}

/**
 * Upload InstancedMesh matrices + optional companion attributes for `usedCount` instances.
 */
export function markInstancedMeshRangeUpdated(mesh, usedCount, companionAttributes = []) {
  let bytes = markAttributeRangeUpdated(mesh.instanceMatrix, usedCount);
  for (const attribute of companionAttributes) {
    if (attribute) {
      bytes += markAttributeRangeUpdated(attribute, usedCount);
    }
  }
  return bytes;
}
