import assert from 'node:assert/strict';
import test from 'node:test';
import { unregisterProceduralDefinitions } from '../src/editor/workshop/ProceduralDefinitionLifecycle.js';

function disposable() {
  return {
    disposed: 0,
    dispose() {
      this.disposed += 1;
    },
  };
}

function fixture() {
  const texture = { ...disposable(), isTexture: true };
  const geometry = disposable();
  const material = { ...disposable(), map: texture };
  const mesh = disposable();
  const foundationMesh = disposable();
  const foundationGeometry = disposable();
  const foundationMaterial = disposable();
  const previewMaterial = disposable();
  const removed = [];
  const definition = { key: 'workshop-test', procedural: true };
  const renderer = {
    definition,
    parts: [{ geometry, material }],
    meshes: [mesh],
    foundationMesh,
    foundationGeometry,
    foundationMaterial,
  };
  const objectMap = {
    definitionByKey: new Map([
      ['base-house', { key: 'base-house' }],
      [definition.key, definition],
    ]),
  };
  const objectView = {
    definitionByKey: new Map([
      ['base-house', { key: 'base-house' }],
      [definition.key, definition],
    ]),
    renderers: new Map([
      ['base-house', { definition: { key: 'base-house' } }],
      [definition.key, renderer],
    ]),
    root: {
      remove(value) {
        removed.push(value);
      },
    },
    previewDefinitionKey: definition.key,
    previewGroup: {
      children: [{ material: previewMaterial }],
      visible: true,
      clear() {
        this.children = [];
      },
    },
    previewFoundation: { visible: true },
    footprintPreview: { visible: true },
    selectionOverlay: { visible: true },
    refreshCount: 0,
    refreshAll() {
      this.refreshCount += 1;
    },
  };
  return {
    definition,
    renderer,
    objectMap,
    objectView,
    removed,
    texture,
    geometry,
    material,
    mesh,
    foundationMesh,
    foundationGeometry,
    foundationMaterial,
    previewMaterial,
  };
}

test('unregistering procedural definitions removes render state and releases resources', () => {
  const state = fixture();
  unregisterProceduralDefinitions({
    objectMap: state.objectMap,
    objectView: state.objectView,
    definitionKeys: [state.definition.key],
  });

  assert.equal(state.objectMap.definitionByKey.has(state.definition.key), false);
  assert.equal(state.objectView.definitionByKey.has(state.definition.key), false);
  assert.equal(state.objectView.renderers.has(state.definition.key), false);
  assert.equal(state.objectMap.definitionByKey.has('base-house'), true);
  assert.equal(state.objectView.renderers.has('base-house'), true);
  assert.deepEqual(state.removed, [state.mesh, state.foundationMesh]);
  assert.equal(state.mesh.disposed, 1);
  assert.equal(state.foundationMesh.disposed, 1);
  assert.equal(state.foundationGeometry.disposed, 1);
  assert.equal(state.foundationMaterial.disposed, 1);
  assert.equal(state.geometry.disposed, 1);
  assert.equal(state.material.disposed, 1);
  assert.equal(state.texture.disposed, 1);
  assert.equal(state.previewMaterial.disposed, 1);
  assert.equal(state.objectView.previewDefinitionKey, null);
  assert.equal(state.objectView.previewGroup.visible, false);
  assert.equal(state.objectView.previewFoundation.visible, false);
  assert.equal(state.objectView.footprintPreview.visible, false);
  assert.equal(state.objectView.selectionOverlay.visible, false);
  assert.equal(state.objectView.refreshCount, 1);
});

test('unregistering refuses non-procedural definitions', () => {
  const state = fixture();
  assert.throws(
    () => unregisterProceduralDefinitions({
      objectMap: state.objectMap,
      objectView: state.objectView,
      definitionKeys: ['base-house'],
    }),
    /non-procedural object definition/,
  );
  assert.equal(state.objectMap.definitionByKey.has('base-house'), true);
  assert.equal(state.objectView.renderers.has('base-house'), true);
});
