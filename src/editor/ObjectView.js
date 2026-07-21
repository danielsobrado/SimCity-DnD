import * as THREE from 'three';
import { QUARTER_TURN_RADIANS } from './constants.js';
import { createObjectModelParts } from './ObjectModelLibrary.js';

const PREVIEW_VALID_COLOR = '#79d47d';
const PREVIEW_INVALID_COLOR = '#db6868';
const SELECTION_COLOR = '#f0cf68';

function nextCapacity(required) {
  let capacity = 8;
  while (capacity < required) {
    capacity *= 2;
  }
  return capacity;
}

export class ObjectView {
  constructor({ terrainView, tileMap, objectMap, objectCatalog }) {
    this.terrainView = terrainView;
    this.tileMap = tileMap;
    this.objectMap = objectMap;
    this.objectCatalog = objectCatalog;
    this.definitionByKey = new Map(objectCatalog.map((definition) => [definition.key, definition]));
    this.root = new THREE.Group();
    this.root.name = 'placed-objects';
    terrainView.scene.add(this.root);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.renderers = new Map();
    this.pickMeshes = [];
    this.previewGroup = new THREE.Group();
    this.previewGroup.visible = false;
    terrainView.scene.add(this.previewGroup);
    this.previewDefinitionKey = null;

    this.footprintPreview = this.createOverlay(PREVIEW_VALID_COLOR, 0.26);
    this.selectionOverlay = this.createOverlay(SELECTION_COLOR, 0.24);
    terrainView.scene.add(this.footprintPreview, this.selectionOverlay);

    const hemisphere = new THREE.HemisphereLight('#dce8ff', '#293326', 1.45);
    const sun = new THREE.DirectionalLight('#fff1cf', 2.1);
    sun.position.set(80, 120, 60);
    terrainView.scene.add(hemisphere, sun);

    for (const definition of objectCatalog) {
      const parts = createObjectModelParts(definition, tileMap.tileSize);
      this.renderers.set(definition.key, { definition, parts, meshes: [], capacity: 0 });
    }

    this.refreshAll();
  }

  createOverlay(color, opacity) {
    const overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.y = 0.075;
    overlay.visible = false;
    return overlay;
  }

  refreshAll() {
    const grouped = new Map(this.objectCatalog.map((definition) => [definition.key, []]));
    for (const object of this.objectMap.list()) {
      grouped.get(object.definitionKey)?.push(object);
    }

    this.pickMeshes = [];
    for (const [definitionKey, renderer] of this.renderers.entries()) {
      const objects = grouped.get(definitionKey) ?? [];
      this.ensureCapacity(renderer, objects.length);
      const objectIds = objects.map((object) => object.id);

      for (const mesh of renderer.meshes) {
        mesh.count = objects.length;
        mesh.userData.objectIds = objectIds;
        this.pickMeshes.push(mesh);
      }

      for (let index = 0; index < objects.length; index += 1) {
        const rootMatrix = this.createObjectMatrix(objects[index]);
        for (let partIndex = 0; partIndex < renderer.parts.length; partIndex += 1) {
          const matrix = new THREE.Matrix4().multiplyMatrices(rootMatrix, renderer.parts[partIndex].matrix);
          renderer.meshes[partIndex].setMatrixAt(index, matrix);
        }
      }

      for (const mesh of renderer.meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    }
  }

  ensureCapacity(renderer, required) {
    if (renderer.capacity >= Math.max(1, required)) {
      return;
    }

    const capacity = nextCapacity(required);
    for (const mesh of renderer.meshes) {
      this.root.remove(mesh);
    }

    renderer.meshes = renderer.parts.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.objectIds = [];
      this.root.add(mesh);
      return mesh;
    });
    renderer.capacity = capacity;
  }

  createObjectMatrix(object) {
    const bounds = this.objectMap.getBounds(
      object.x,
      object.z,
      object.definitionKey,
      object.rotation,
    );
    const center = this.terrainView.boundsToWorld(bounds);
    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -object.rotation * QUARTER_TURN_RADIANS,
    );
    return new THREE.Matrix4().compose(
      new THREE.Vector3(center.x, 0, center.z),
      quaternion,
      new THREE.Vector3(1, 1, 1),
    );
  }

  pickObject(clientX, clientY, camera) {
    const bounds = this.terrainView.renderer.domElement.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return null;
    }
    this.pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, camera);

    const hit = this.raycaster.intersectObjects(this.pickMeshes, false)[0];
    if (!hit || hit.instanceId === undefined) {
      return null;
    }
    return hit.object.userData.objectIds[hit.instanceId] ?? null;
  }

  setPreview(preview) {
    if (!preview) {
      this.previewGroup.visible = false;
      this.footprintPreview.visible = false;
      return;
    }

    if (this.previewDefinitionKey !== preview.definitionKey) {
      this.rebuildPreview(preview.definitionKey);
    }

    const object = {
      definitionKey: preview.definitionKey,
      x: preview.x,
      z: preview.z,
      rotation: preview.rotation,
    };
    const matrix = this.createObjectMatrix(object);
    matrix.decompose(this.previewGroup.position, this.previewGroup.quaternion, this.previewGroup.scale);
    const color = preview.valid ? PREVIEW_VALID_COLOR : PREVIEW_INVALID_COLOR;
    for (const mesh of this.previewGroup.children) {
      mesh.material.color.set(color);
    }
    this.previewGroup.visible = true;

    const bounds = this.objectMap.getBounds(preview.x, preview.z, preview.definitionKey, preview.rotation);
    this.positionOverlay(this.footprintPreview, bounds, color);
  }

  rebuildPreview(definitionKey) {
    for (const child of this.previewGroup.children) {
      child.material.dispose();
    }
    this.previewGroup.clear();

    const renderer = this.renderers.get(definitionKey);
    if (!renderer) {
      throw new Error(`Unknown object definition: ${definitionKey}.`);
    }
    for (const part of renderer.parts) {
      const mesh = new THREE.Mesh(
        part.geometry,
        new THREE.MeshBasicMaterial({
          color: PREVIEW_VALID_COLOR,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
        }),
      );
      part.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      this.previewGroup.add(mesh);
    }
    this.previewDefinitionKey = definitionKey;
  }

  setSelection(objectId) {
    const object = objectId ? this.objectMap.getById(objectId) : null;
    if (!object) {
      this.selectionOverlay.visible = false;
      return;
    }
    const bounds = this.objectMap.getBounds(object.x, object.z, object.definitionKey, object.rotation);
    this.positionOverlay(this.selectionOverlay, bounds, SELECTION_COLOR);
  }

  positionOverlay(overlay, bounds, color) {
    const center = this.terrainView.boundsToWorld(bounds);
    overlay.position.x = center.x;
    overlay.position.z = center.z;
    overlay.scale.set(
      bounds.width * this.tileMap.tileSize,
      bounds.depth * this.tileMap.tileSize,
      1,
    );
    overlay.material.color.set(color);
    overlay.visible = true;
  }

  dispose() {
    for (const renderer of this.renderers.values()) {
      for (const mesh of renderer.meshes) {
        this.root.remove(mesh);
      }
      for (const part of renderer.parts) {
        part.geometry.dispose();
        part.material.dispose();
      }
    }
    for (const child of this.previewGroup.children) {
      child.material.dispose();
    }
    this.footprintPreview.geometry.dispose();
    this.footprintPreview.material.dispose();
    this.selectionOverlay.geometry.dispose();
    this.selectionOverlay.material.dispose();
    this.terrainView.scene.remove(this.root, this.previewGroup, this.footprintPreview, this.selectionOverlay);
  }
}
