import * as THREE from 'three/webgpu';
import {
  createIdentityComponentTransform,
  isIdentityComponentTransform,
  normalizeComponentTransform,
  serializeComponentTransforms,
  WORKSHOP_COMPONENT_TRANSFORM_LIMITS,
} from './ProceduralWorkshopComponentTransforms.js';

const POINTER_SELECT_DISTANCE = 5;
const COMPONENT_POSITION_LIMIT = WORKSHOP_COMPONENT_TRANSFORM_LIMITS.position;
const SELECTION_COLOR = 0xf0d675;
const COMPONENT_KIND_ORDER = Object.freeze({
  structure: 0,
  roof: 1,
  door: 2,
  window: 3,
  opening: 4,
  woodwork: 5,
  metalwork: 6,
  foliage: 7,
});

function normalizeAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function componentTransformFromGroup(group) {
  const basePosition = group.userData.workshopBasePosition;
  return normalizeComponentTransform({
    position: [
      group.position.x - basePosition.x,
      group.position.y - basePosition.y,
      group.position.z - basePosition.z,
    ],
    rotation: [
      normalizeAngle(group.rotation.x),
      normalizeAngle(group.rotation.y),
      normalizeAngle(group.rotation.z),
    ],
    scale: group.scale.toArray(),
  });
}

function combineComponentTransforms(base, delta) {
  return normalizeComponentTransform({
    position: base.position.map((value, index) => value + delta.position[index]),
    rotation: base.rotation.map((value, index) => normalizeAngle(value + delta.rotation[index])),
    scale: base.scale.map((value, index) => value * delta.scale[index]),
  });
}

function applyTransform(group, transform) {
  const basePosition = group.userData.workshopBasePosition;
  group.position.set(
    basePosition.x + transform.position[0],
    basePosition.y + transform.position[1],
    basePosition.z + transform.position[2],
  );
  group.rotation.set(...transform.rotation);
  group.scale.set(...transform.scale);
  group.updateMatrixWorld(true);
}

function componentSort(left, right) {
  const leftOrder = COMPONENT_KIND_ORDER[left.kind] ?? 99;
  const rightOrder = COMPONENT_KIND_ORDER[right.kind] ?? 99;
  return leftOrder - rightOrder || left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
}

function createSelectionHelper() {
  const helper = new THREE.Box3Helper(new THREE.Box3(), SELECTION_COLOR);
  helper.name = 'workshop-component-selection';
  helper.visible = false;
  helper.raycast = () => {};
  return helper;
}

function isOpening2d(component) {
  return component?.transformPolicy === 'opening2d';
}

export class ProceduralWorkshopComponentController {
  constructor({
    root,
    previewRoot,
    renderer,
    camera,
    orbitControls,
    transformControls,
    onChange,
  }) {
    this.root = root;
    this.previewRoot = previewRoot;
    this.renderer = renderer;
    this.camera = camera;
    this.orbitControls = orbitControls;
    this.transformControls = transformControls;
    this.onChange = onChange;
    this.transforms = {};
    this.groups = new Map();
    this.meshes = [];
    this.selectedComponentId = null;
    this.mode = 'translate';
    this.dragging = false;
    this.pointerStart = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.selectionHelper = createSelectionHelper();
    previewRoot.add(this.selectionHelper);

    root.innerHTML = `
      <label class="workshop-component-select">
        Selected component
        <select data-role="workshop-component-select" aria-label="Selected editable component"></select>
      </label>
      <span class="workshop-component-hint" data-role="workshop-component-hint">
        Click a wall, roof, door, window, tower, or detail in the preview.
      </span>
    `;
    this.select = root.querySelector('[data-role="workshop-component-select"]');
    this.hint = root.querySelector('[data-role="workshop-component-hint"]');

    this.onSelectChange = () => this.selectComponent(this.select.value);
    this.onPointerDown = (event) => this.pointerDown(event);
    this.onPointerUp = (event) => this.pointerUp(event);
    this.onDraggingChanged = ({ value }) => {
      this.dragging = value;
      this.orbitControls.enabled = !value;
      if (!value) this.commitSelectedTransform();
    };
    this.onObjectChange = () => {
      this.constrainSelectedTransform();
      this.updateSelectionHelper();
    };

    this.select.addEventListener('change', this.onSelectChange);
    renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    transformControls.addEventListener('dragging-changed', this.onDraggingChanged);
    transformControls.addEventListener('objectChange', this.onObjectChange);
  }

  pointerDown(event) {
    if (event.button !== 0) return;
    this.pointerStart = { x: event.clientX, y: event.clientY };
  }

  pointerUp(event) {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || this.dragging || event.button !== 0) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > POINTER_SELECT_DISTANCE) {
      return;
    }

    const bounds = this.renderer.domElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    const componentId = hit?.object?.userData?.workshopComponentId;
    if (componentId) this.selectComponent(componentId);
  }

  pruneTransforms(definitions) {
    for (const componentId of Object.keys(this.transforms)) {
      if (!definitions.has(componentId)) delete this.transforms[componentId];
    }
  }

  createGroups(definitions) {
    for (const component of definitions.values()) {
      const group = new THREE.Group();
      group.name = `workshop-component-${component.id}`;
      group.userData.workshopComponent = component;
      group.userData.workshopPivot = new THREE.Vector3(...component.pivot);
      this.groups.set(component.id, group);
    }

    for (const component of definitions.values()) {
      const group = this.groups.get(component.id);
      const parent = component.parentId ? this.groups.get(component.parentId) : null;
      const parentPivot = parent?.userData.workshopPivot ?? new THREE.Vector3();
      group.userData.workshopBasePosition = group.userData.workshopPivot.clone().sub(parentPivot);
      if (parent) parent.add(group);
      else this.previewRoot.add(group);

      const storedTransform = this.transforms[component.id]
        ?? component.storedTransform
        ?? component.transform;
      group.userData.workshopStoredTransform = storedTransform;
      if (!isIdentityComponentTransform(storedTransform)) {
        this.transforms[component.id] = storedTransform;
      }
      applyTransform(
        group,
        isOpening2d(component) ? createIdentityComponentTransform() : storedTransform,
      );
    }
  }

  replaceParts(parts) {
    this.clear();
    const definitions = new Map();
    for (const part of parts) {
      const identity = createIdentityComponentTransform();
      const component = part.component ?? Object.freeze({
        id: 'structure-main',
        label: 'Main structure',
        kind: 'structure',
        parentId: null,
        pivot: Object.freeze([0, 0, 0]),
        transform: identity,
        storedTransform: identity,
        transformPolicy: 'free',
      });
      definitions.set(component.id, component);
    }
    this.pruneTransforms(definitions);
    this.createGroups(definitions);

    for (const part of parts) {
      const componentId = part.component?.id ?? 'structure-main';
      const group = this.groups.get(componentId);
      const mesh = new THREE.Mesh(part.geometry, part.material);
      part.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.workshopComponentId = componentId;
      group.add(mesh);
      this.meshes.push(mesh);
    }

    const ordered = [...definitions.values()].sort(componentSort);
    this.select.replaceChildren(...ordered.map((component) => {
      const option = document.createElement('option');
      option.value = component.id;
      option.textContent = component.label;
      return option;
    }));
    const preferred = this.selectedComponentId && this.groups.has(this.selectedComponentId)
      ? this.selectedComponentId
      : this.groups.has('structure-main') ? 'structure-main' : ordered[0]?.id;
    if (preferred) this.selectComponent(preferred);
  }

  updateSelectionHelper() {
    const group = this.groups.get(this.selectedComponentId);
    if (!group) {
      this.selectionHelper.visible = false;
      return;
    }
    group.updateWorldMatrix(true, true);
    this.selectionHelper.box.setFromObject(group);
    this.selectionHelper.visible = !this.selectionHelper.box.isEmpty();
  }

  selectComponent(componentId) {
    const group = this.groups.get(componentId);
    if (!group) return;
    this.selectedComponentId = componentId;
    this.select.value = componentId;
    this.transformControls.attach(group);
    this.setMode(this.mode);
    this.updateSelectionHelper();
    const component = group.userData.workshopComponent;
    this.hint.textContent = isOpening2d(component)
      ? `${component.label} selected · move within the wall plane or scale its width and height.`
      : `${component.label} selected · move, rotate, or scale with the gizmo.`;
  }

  setMode(requestedMode) {
    if (!['translate', 'rotate', 'scale'].includes(requestedMode)) return this.mode;
    const component = this.groups.get(this.selectedComponentId)?.userData.workshopComponent;
    const mode = isOpening2d(component) && requestedMode === 'rotate'
      ? 'translate'
      : requestedMode;
    this.mode = mode;
    this.transformControls.setMode(mode);
    this.transformControls.setSpace(mode === 'translate' ? 'world' : 'local');
    if (isOpening2d(component)) {
      this.transformControls.showX = true;
      this.transformControls.showY = true;
      this.transformControls.showZ = false;
    } else {
      this.transformControls.showX = true;
      this.transformControls.showY = true;
      this.transformControls.showZ = true;
    }
    return mode;
  }

  constrainSelectedTransform() {
    const group = this.groups.get(this.selectedComponentId);
    if (!group || this.transformControls.object !== group) return;
    const basePosition = group.userData.workshopBasePosition;
    group.position.x = THREE.MathUtils.clamp(
      group.position.x,
      basePosition.x - COMPONENT_POSITION_LIMIT,
      basePosition.x + COMPONENT_POSITION_LIMIT,
    );
    group.position.y = THREE.MathUtils.clamp(
      group.position.y,
      basePosition.y - COMPONENT_POSITION_LIMIT,
      basePosition.y + COMPONENT_POSITION_LIMIT,
    );
    group.position.z = THREE.MathUtils.clamp(
      group.position.z,
      basePosition.z - COMPONENT_POSITION_LIMIT,
      basePosition.z + COMPONENT_POSITION_LIMIT,
    );
    group.scale.x = THREE.MathUtils.clamp(
      Math.abs(group.scale.x),
      WORKSHOP_COMPONENT_TRANSFORM_LIMITS.scaleMin,
      WORKSHOP_COMPONENT_TRANSFORM_LIMITS.scaleMax,
    );
    group.scale.y = THREE.MathUtils.clamp(
      Math.abs(group.scale.y),
      WORKSHOP_COMPONENT_TRANSFORM_LIMITS.scaleMin,
      WORKSHOP_COMPONENT_TRANSFORM_LIMITS.scaleMax,
    );
    group.scale.z = THREE.MathUtils.clamp(
      Math.abs(group.scale.z),
      WORKSHOP_COMPONENT_TRANSFORM_LIMITS.scaleMin,
      WORKSHOP_COMPONENT_TRANSFORM_LIMITS.scaleMax,
    );

    if (isOpening2d(group.userData.workshopComponent)) {
      group.position.z = basePosition.z;
      group.rotation.set(0, 0, 0);
      group.scale.z = 1;
    }
  }

  commitSelectedTransform() {
    const group = this.groups.get(this.selectedComponentId);
    if (!group) return;
    this.constrainSelectedTransform();
    const delta = componentTransformFromGroup(group);
    const topologyDriven = isOpening2d(group.userData.workshopComponent);
    const transform = topologyDriven
      ? combineComponentTransforms(group.userData.workshopStoredTransform, delta)
      : delta;
    if (isIdentityComponentTransform(transform)) {
      delete this.transforms[this.selectedComponentId];
    } else {
      this.transforms[this.selectedComponentId] = transform;
    }
    group.userData.workshopStoredTransform = transform;
    if (topologyDriven) applyTransform(group, createIdentityComponentTransform());
    this.updateSelectionHelper();
    this.onChange?.(group.userData.workshopComponent, transform);
  }

  resetSelected() {
    const group = this.groups.get(this.selectedComponentId);
    if (!group) return;
    delete this.transforms[this.selectedComponentId];
    const identity = createIdentityComponentTransform();
    group.userData.workshopStoredTransform = identity;
    applyTransform(group, identity);
    this.updateSelectionHelper();
    this.onChange?.(group.userData.workshopComponent, identity);
  }

  resetAll() {
    this.transforms = {};
    const identity = createIdentityComponentTransform();
    for (const group of this.groups.values()) {
      group.userData.workshopStoredTransform = identity;
      applyTransform(group, identity);
    }
    this.updateSelectionHelper();
    this.onChange?.(null, identity);
  }

  toDocument() {
    return serializeComponentTransforms(this.transforms);
  }

  clear() {
    const attachedId = this.transformControls.object?.userData?.workshopComponent?.id;
    if (attachedId && this.groups.has(attachedId)) this.transformControls.detach();
    for (const group of this.groups.values()) {
      if (!group.userData.workshopComponent.parentId) this.previewRoot.remove(group);
    }
    this.groups.clear();
    this.meshes = [];
    this.select.replaceChildren();
    this.selectionHelper.visible = false;
  }

  dispose() {
    this.clear();
    this.previewRoot.remove(this.selectionHelper);
    this.selectionHelper.geometry.dispose();
    this.selectionHelper.material.dispose();
    this.select.removeEventListener('change', this.onSelectChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.transformControls.removeEventListener('dragging-changed', this.onDraggingChanged);
    this.transformControls.removeEventListener('objectChange', this.onObjectChange);
    this.root.replaceChildren();
  }
}
