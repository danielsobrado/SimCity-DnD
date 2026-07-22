import * as THREE from 'three';
import { materialList } from '../assets/assetUrl.js';
import {
  bakeWorldGeometry,
  isUprightSize,
} from './StylizedPrototypeBake.js';

export function meshKind(mesh, config) {
  const names = materialList(mesh).map((material) => material?.name);
  if (names.includes(config.assets.leafMaterial)) return 'leaf';
  if (names.includes(config.assets.trunkMaterial)) return 'trunk';
  return null;
}

function subtreeKinds(root, config) {
  let hasLeaf = false;
  let hasTrunk = false;
  root.traverse((node) => {
    if (!node.isMesh) return;
    const kind = meshKind(node, config);
    hasLeaf ||= kind === 'leaf';
    hasTrunk ||= kind === 'trunk';
  });
  return { hasLeaf, hasTrunk };
}

export function findPrototypeRoots(root, config) {
  const kinds = subtreeKinds(root, config);
  if (!kinds.hasLeaf || !kinds.hasTrunk) return [];
  const nested = root.children.flatMap((child) => findPrototypeRoots(child, config));
  return nested.length > 0 ? nested : [root];
}

/**
 * Bake each pine part through its full world matrix so Sketchfab parent scale
 * and the −90° axis fix stay intact. Ground on the trunk base (not hanging
 * foliage) so trunks don't float when leaves extend below the bark.
 */
export function extractPrototypeParts(root, config) {
  const sources = [];
  root.traverse((node) => {
    if (!node.isMesh) return;
    const kind = meshKind(node, config);
    if (!kind) return;
    sources.push({ node, kind });
  });
  if (sources.length === 0) return null;

  const combinedMin = new THREE.Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  const combinedMax = new THREE.Vector3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  );
  let trunkMinY = Number.POSITIVE_INFINITY;
  const baked = sources.map(({ node, kind }) => {
    const geometry = bakeWorldGeometry(node);
    geometry.computeBoundingBox();
    combinedMin.min(geometry.boundingBox.min);
    combinedMax.max(geometry.boundingBox.max);
    if (kind === 'trunk') {
      trunkMinY = Math.min(trunkMinY, geometry.boundingBox.min.y);
    }
    return { geometry, kind, source: node };
  });

  const size = combinedMax.clone().sub(combinedMin);
  if (!isUprightSize(size, { strict: true }) || !Number.isFinite(trunkMinY)) {
    for (const part of baked) part.geometry.dispose();
    return null;
  }

  const centerX = (combinedMin.x + combinedMax.x) * 0.5;
  const centerZ = (combinedMin.z + combinedMax.z) * 0.5;
  for (const part of baked) {
    part.geometry.translate(-centerX, -trunkMinY, -centerZ);
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
    part.geometry.computeVertexNormals();
  }
  return baked.map(({ geometry, kind, source }) => ({ geometry, kind, source }));
}
