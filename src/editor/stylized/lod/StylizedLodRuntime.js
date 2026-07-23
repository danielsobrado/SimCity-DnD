import * as THREE from 'three/webgpu';
import { projectedPixelHeight, selectProjectedLod, clampLodToRadii } from './projectedLod.js';

export function createInstancedRenderers({ root, partsByPrototype, capacity, name, castShadow }) {
  return partsByPrototype.map((parts, prototypeIndex) => parts.map((part, partIndex) => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
    mesh.count = 0;
    mesh.castShadow = Boolean(castShadow && part.kind !== 'leaf');
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.name = `${name}-${prototypeIndex}-${partIndex}`;
    root.add(mesh);
    return mesh;
  }));
}

export function writeMatrices(renderers, matricesByPrototype) {
  let total = 0;
  renderers.forEach((parts, prototypeIndex) => {
    const matrices = matricesByPrototype[prototypeIndex] ?? [];
    total += matrices.length;
    for (const mesh of parts) {
      mesh.count = matrices.length;
      for (let index = 0; index < matrices.length; index += 1) {
        mesh.setMatrixAt(index, matrices[index]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  });
  return total;
}

export function disposeInstancedRenderers(root, renderers) {
  for (const parts of renderers) {
    for (const mesh of parts) {
      root.remove(mesh);
      mesh.dispose();
    }
  }
  renderers.length = 0;
}

export function buildChunkLodPlan({
  focus,
  radius,
  chunkWorldSize,
  floatingOrigin,
  camera,
  viewportHeight,
  objectHeight,
  thresholds,
  radii,
  previousStates,
}) {
  const entries = [];
  const signature = [];
  const origin = floatingOrigin.getState();

  for (let chunkZ = focus.chunkZ - radius; chunkZ <= focus.chunkZ + radius; chunkZ += 1) {
    for (let chunkX = focus.chunkX - radius; chunkX <= focus.chunkX + radius; chunkX += 1) {
      const chunkDistance = Math.max(Math.abs(chunkX - focus.chunkX), Math.abs(chunkZ - focus.chunkZ));
      const canonicalX = (chunkX + 0.5) * chunkWorldSize;
      const canonicalZ = -(chunkZ + 0.5) * chunkWorldSize;
      const worldPosition = {
        x: canonicalX - origin.x,
        y: objectHeight * 0.5,
        z: canonicalZ - origin.z,
      };
      const pixels = projectedPixelHeight({
        camera,
        worldPosition,
        worldHeight: objectHeight,
        viewportHeight,
      });
      const key = `${chunkX}:${chunkZ}`;
      const selected = selectProjectedLod({
        pixels,
        previous: previousStates.get(key) ?? null,
        ...thresholds,
      });
      const band = clampLodToRadii({ band: selected, chunkDistance, ...radii });
      previousStates.set(key, band);
      entries.push({ chunkX, chunkZ, band });
      signature.push(`${key}:${band}`);
    }
  }

  return { entries, signature: signature.join('|') };
}

export function pruneStateMap(states, entries) {
  const active = new Set(entries.map((entry) => `${entry.chunkX}:${entry.chunkZ}`));
  for (const key of states.keys()) {
    if (!active.has(key)) states.delete(key);
  }
}
