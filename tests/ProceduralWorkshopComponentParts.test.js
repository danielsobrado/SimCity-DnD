import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { disposeModelParts } from '../src/editor/assets/modelParts.js';
import { createProceduralWorkshopComponentParts } from '../src/editor/workshop/ProceduralWorkshopComponentParts.js';

function recipe(overrides = {}) {
  return {
    archetype: 'manor',
    style: 'limestone',
    topStyle: 'slate',
    finish: 'ochre',
    shape: 'stepped',
    towerSide: 'left',
    width: 8,
    depth: 2.5,
    height: 5.5,
    roofScale: 1.15,
    roofOverhang: 0.45,
    seed: 1848,
    detail: 2,
    weathering: 0.35,
    windows: true,
    ivy: true,
    remesh: true,
    albedo: true,
    surfaceTextures: { sources: {}, slots: {} },
    componentTransforms: {},
    ...overrides,
  };
}

function boundsForParts(parts) {
  const root = new THREE.Group();
  for (const part of parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    part.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    root.add(mesh);
  }
  return new THREE.Box3().setFromObject(root);
}

test('workshop preview exposes walls, roofs, doors, and windows as editable components', () => {
  const parts = createProceduralWorkshopComponentParts(recipe(), { preserveComponents: true });
  try {
    const components = new Map(parts.components.map((component) => [component.id, component]));
    assert.ok(components.has('structure-main'));
    assert.ok([...components.values()].some((component) => component.kind === 'roof'));
    assert.ok([...components.values()].some((component) => component.kind === 'door'));
    assert.ok([...components.values()].some((component) => component.kind === 'window'));
    assert.ok(parts.every((part) => part.component?.id));
    assert.equal(parts.stats.components, components.size);
  } finally {
    disposeModelParts(parts);
  }
});

test('component transforms are applied before draw-call remeshing', () => {
  const base = createProceduralWorkshopComponentParts(recipe());
  const edited = createProceduralWorkshopComponentParts(recipe({
    componentTransforms: {
      'structure-main': {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1.5, 1.2, 1.35],
      },
    },
  }));
  try {
    const baseSize = boundsForParts(base).getSize(new THREE.Vector3());
    const editedSize = boundsForParts(edited).getSize(new THREE.Vector3());
    assert.ok(editedSize.x > baseSize.x);
    assert.ok(editedSize.z > baseSize.z);
    assert.ok(edited.every((part) => !part.component));
    assert.ok(edited.length <= 7);
  } finally {
    disposeModelParts(base);
    disposeModelParts(edited);
  }
});

test('preview component pivots preserve stored door edits across regeneration', () => {
  const parts = createProceduralWorkshopComponentParts(recipe({
    componentTransforms: {
      'door-1': {
        position: [0.75, 0.2, 0],
        rotation: [0, Math.PI / 6, 0],
        scale: [1.25, 1.4, 1],
      },
    },
  }), { preserveComponents: true });
  try {
    const door = parts.components.find((component) => component.id === 'door-1');
    assert.ok(door);
    assert.deepEqual(door.transform.position, [0.75, 0.2, 0]);
    assert.deepEqual(door.transform.scale, [1.25, 1.4, 1]);
    assert.equal(door.pivot.length, 3);
  } finally {
    disposeModelParts(parts);
  }
});
