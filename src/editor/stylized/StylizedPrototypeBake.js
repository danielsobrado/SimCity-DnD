import * as THREE from 'three';

/**
 * Shared GLB prototype grounding for stylized scatter.
 *
 * Upstream GrassField keeps rocks/trees at their authored scene transforms.
 * When we re-instance them across the streamed world we must NOT bake the
 * demo's art-directed tumble/lean into the prototype — only the mesh shape
 * and Sketchfab world scale — then sit the AABB on y = 0.
 */

export function groundGeometry(geometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const centerX = (bounds.min.x + bounds.max.x) * 0.5;
  const centerZ = (bounds.min.z + bounds.max.z) * 0.5;
  geometry.translate(-centerX, -bounds.min.y, -centerZ);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Scale-only bake: drops placement rotation/lean from the demo GLB so scatter
 * instances rest naturally. Matches the mesh's local authored up-axis.
 */
export function bakeScaledGeometry(mesh) {
  const geometry = mesh.geometry.clone();
  const worldScale = new THREE.Vector3();
  mesh.getWorldScale(worldScale);
  geometry.scale(
    Math.abs(worldScale.x) || 1,
    Math.abs(worldScale.y) || 1,
    Math.abs(worldScale.z) || 1,
  );
  return groundGeometry(geometry);
}

/**
 * Full world-matrix bake: keeps parent axis fixes (Sketchfab −90°) and nested
 * part offsets. Used for multi-part pines whose parts are authored upright
 * under a Sketchfab root.
 */
export function bakeWorldGeometry(mesh) {
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  return geometry;
}

export function isUprightSize(size, { strict = false } = {}) {
  if (strict) return size.y >= size.x && size.y >= size.z;
  return size.y >= size.x * 0.55 && size.y >= size.z * 0.55;
}

/**
 * Rock prototypes: scale only — never bake the demo GLB's placement tumble.
 * Dedupes repeated instances of the same mesh geometry.
 */
export function extractRockPrototypes(scene, rockMaterialName) {
  const seenGroups = new Set();
  const prototypes = [];
  scene.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (!materials.some((material) => material?.name === rockMaterialName)) return;
    // Demo GLB instances the same rock mesh with different placement tumbles.
    // Group by parent (SM_Rocks_01, …) so we keep one resting prototype each.
    const groupKey = node.parent?.name || node.geometry?.uuid || node.name;
    if (!groupKey || seenGroups.has(groupKey)) return;
    seenGroups.add(groupKey);
    prototypes.push({
      geometry: bakeScaledGeometry(node),
      source: node,
    });
  });
  return prototypes;
}
