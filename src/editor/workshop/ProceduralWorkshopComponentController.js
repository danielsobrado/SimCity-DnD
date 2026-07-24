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
  const pivot = group.userData.workshopPivot;
  return normalizeComponentTransform({
    position: [
      group.position.x - pivot.x,
      group.position.y - pivot.y,
      group.position.z - pivot.z,
    ],
    rotation: [
      normalizeAngle(group.rotation.x),
      normalizeAngle(group.rotation.y),
      normalizeAngle(group.rotation.z),
    ],
    scale: group.scale.toArray(),
  });
}

function applyTransform(group, transform) {
  const pivot = group.userData.workshopPivot;
  group.position.set(
    pivot.x + transform.position[0],
    pivot.y + transform.position[1],
    pivot.z + transform.position[2],
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
    this.selectedComponentId = null;
    this.mode = 'translate';
    this.dragging = false;
    this.pointerStart = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

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
    this.onObjectChange = () => this.constrainSelectedTransform();

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
    const meshes = [];
    for (const group of this.groups.values()) {
      meshes.push(...group.children);
    }
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    const componentId = hit?.object?.userData?.workshopComponentId;
    if (componentId) this.selectComponent(componentId);
  }

  replaceParts(parts) {
    this.clear();
    const definitions = new Map();
    for (const part of parts) {
      const component = part.component ?? Object.freeze({
        id: 'structure-main',
        label: 'Main structure',
        kind: 'structure',
        pivot: Object.freeze([0, 0, 0]),
        transform: createIdentityComponentTransform(),
      });
      definitions.set(component.id, component);
      let group = this.groups.get(component.id);
      if (!group) {
        group = new THREE.Group();
        group.name = `workshop-component-${component.id}`;
        group.userData.workshopComponent = component;
        group.userData.workshopPivot = new THREE.Vector3(...component.pivot);
        const transform = this.transforms[component.id] ?? component.transform;
        if (!isIdentityComponentTransform(transform)) {
          this.transforms[component.id] = transform;
        }
        applyTransform(group, transform);
        this.groups.set(component.id, group);
        this.previewRoot.add(group);
      }

      const mesh = new THREE.Mesh(part.geometry, part.material);
      part.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.workshopComponentId = component.id;
      group.add(mesh);
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

  selectComponent(componentId) {
    const group = this.groups.get(componentId);
    if (!group) return;
    this.selectedComponentId = componentId;
    this.select.value = componentId;
    this.transformControls.attach(group);
    this.setMode(this.mode);
    const component = group.userData.workshopComponent;
    this.hint.textContent = `${component.label} selected · move, rotate, or scale with the gizmo.`;
  }

  setMode(mode) {
    if (!['translate', 'rotate', 'scale'].includes(mode)) return;
    this.mode = mode;
    this.transformControls.setMode(mode);
    this.transformControls.setSpace(mode === 'translate' ? 'world' : 'local');
    this.transformControls.showX = true;
    this.transformControls.showY = true;
    this.transformControls.showZ = true;
  }

  constrainSelectedTransform() {
    const group = this.groups.get(this.selectedComponentId);
    if (!group || this.transformControls.object !== group) return;
    const pivot = group.userData.workshopPivot;
    group.position.x = THREE.MathUtils.clamp(
      group.position.x,
      pivot.x - COMPONENT_POSITION_LIMIT,
      pivot.x + COMPONENT_POSITION_LIMIT,
    );
    group.position.y = THREE.MathUtils.clamp(
      group.position.y,
      pivot.y - COMPONENT_POSITION_LIMIT,
      pivot.y + COMPONENT_POSITION_LIMIT,
    );
    group.position.z = THREE.MathUtils.clamp(
      group.position.z,
      pivot.z - COMPONENT_POSITION_LIMIT,
      pivot.z + COMPONENT_POSITION_LIMIT,
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
  }

  commitSelectedTransform() {
    const group = this.groups.get(this.selectedComponentId);
    if (!group) return;
    this.constrainSelectedTransform();
    const transform = componentTransformFromGroup(group);
    if (isIdentityComponentTransform(transform)) {
      delete this.transforms[this.selectedComponentId];
    } else {
      this.transforms[this.selectedComponentId] = transform;
    }
    this.onChange?.(group.userData.workshopComponent, transform);
  }

  resetSelected() {
    const group = this.groups.get(this.selectedComponentId);
    if (!group) return;
    delete this.transforms[this.selectedComponentId];
    const identity = createIdentityComponentTransform();
    applyTransform(group, identity);
    this.onChange?.(group.userData.workshopComponent, identity);
  }

  toDocument() {
    return serializeComponentTransforms(this.transforms);
  }

  clear() {
    if (this.transformControls.object && this.groups.has(this.transformControls.object.userData?.workshopComponent?.id)) {
      this.transformControls.detach();
    }
    for (const group of this.groups.values()) {
      this.previewRoot.remove(group);
    }
    this.groups.clear();
    this.select.replaceChildren();
  }

  dispose() {
    this.clear();
    this.select.removeEventListener('change', this.onSelectChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.transformControls.removeEventListener('dragging-changed', this.onDraggingChanged);
    this.transformControls.removeEventListener('objectChange', this.onObjectChange);
    this.root.replaceChildren();
  }
}
