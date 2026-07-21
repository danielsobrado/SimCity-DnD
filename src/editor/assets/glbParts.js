import * as THREE from 'three';
import { cloneMaterial, disposeModelParts } from './modelParts.js';

const BOUNDS_TOLERANCE = 1.2;
const FLOOR_TOLERANCE_CELLS = 0.05;

function createAssetMatrix(asset, tileSize) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...asset.offset).multiplyScalar(tileSize),
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.degToRad(asset.rotationY),
    ),
    new THREE.Vector3(1, 1, 1).multiplyScalar(asset.scale * tileSize),
  );
}

function validateBounds(parts, definition, tileSize) {
  const bounds = new THREE.Box3();
  for (const part of parts) {
    bounds.union(part.geometry.boundingBox.clone().applyMatrix4(part.matrix));
  }

  const size = bounds.getSize(new THREE.Vector3());
  const maxWidth = definition.footprint.width * tileSize * BOUNDS_TOLERANCE;
  const maxDepth = definition.footprint.depth * tileSize * BOUNDS_TOLERANCE;
  if (size.x > maxWidth || size.z > maxDepth) {
    throw new Error(
      `Object ${definition.key} GLB exceeds its ${definition.footprint.width} × ${definition.footprint.depth} footprint.`,
    );
  }
  if (bounds.min.y < -tileSize * FLOOR_TOLERANCE_CELLS) {
    throw new Error(`Object ${definition.key} GLB extends below its ground pivot.`);
  }
}

export function extractStaticParts(root, definition, tileSize) {
  root.updateWorldMatrix(true, true);
  const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const assetMatrix = createAssetMatrix(definition.asset, tileSize);
  const parts = [];

  try {
    root.traverse((node) => {
      if (!node.isMesh || !node.visible) {
        return;
      }
      if (node.isSkinnedMesh) {
        throw new Error(`Object ${definition.key} requires a static GLB mesh.`);
      }

      const relativeMatrix = new THREE.Matrix4().multiplyMatrices(inverseRoot, node.matrixWorld);
      const geometry = node.geometry.clone();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      parts.push({
        geometry,
        material: cloneMaterial(node.material),
        matrix: new THREE.Matrix4().multiplyMatrices(assetMatrix, relativeMatrix),
      });
    });

    if (parts.length === 0) {
      throw new Error(`Object ${definition.key} GLB node contains no visible meshes.`);
    }
    validateBounds(parts, definition, tileSize);
    return parts;
  } catch (error) {
    disposeModelParts(parts);
    throw error;
  }
}
