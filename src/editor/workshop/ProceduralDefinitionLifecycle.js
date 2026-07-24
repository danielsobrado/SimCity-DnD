import { disposeModelParts } from '../assets/modelParts.js';

function disposeRenderer(objectView, renderer) {
  for (const mesh of renderer.meshes) {
    objectView.root.remove(mesh);
    mesh.dispose?.();
  }
  if (renderer.foundationMesh) {
    objectView.root.remove(renderer.foundationMesh);
    renderer.foundationMesh.dispose?.();
  }
  renderer.foundationGeometry?.dispose();
  renderer.foundationMaterial?.dispose();
  disposeModelParts(renderer.parts);
}

function clearPreview(objectView, definitionKeys) {
  if (!definitionKeys.has(objectView.previewDefinitionKey)) return;
  for (const child of objectView.previewGroup.children) {
    child.material.dispose();
  }
  objectView.previewGroup.clear();
  objectView.previewGroup.visible = false;
  objectView.previewDefinitionKey = null;
  objectView.previewFoundation.visible = false;
  objectView.footprintPreview.visible = false;
}

export function collectProceduralDefinitionKeys({ objectMap, objectView, definitionKeys = [] }) {
  const keys = new Set(definitionKeys);
  for (const [key, definition] of objectMap.definitionByKey) {
    if (definition.procedural === true) keys.add(key);
  }
  for (const [key, definition] of objectView.definitionByKey) {
    if (definition.procedural === true) keys.add(key);
  }
  return keys;
}

export function unregisterProceduralDefinitions({ objectMap, objectView, definitionKeys = [] }) {
  const keys = collectProceduralDefinitionKeys({ objectMap, objectView, definitionKeys });
  if (keys.size === 0) return;

  clearPreview(objectView, keys);
  for (const key of keys) {
    const mapDefinition = objectMap.definitionByKey.get(key);
    const viewDefinition = objectView.definitionByKey.get(key);
    if (
      (mapDefinition && mapDefinition.procedural !== true)
      || (viewDefinition && viewDefinition.procedural !== true)
    ) {
      throw new Error(`Cannot unregister non-procedural object definition: ${key}.`);
    }

    const renderer = objectView.renderers.get(key);
    if (renderer) disposeRenderer(objectView, renderer);
    objectView.renderers.delete(key);
    objectView.definitionByKey.delete(key);
    objectMap.definitionByKey.delete(key);
  }

  objectView.selectionOverlay.visible = false;
  objectView.refreshAll();
}
