import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

export class EditorCamera {
  constructor({ canvas, viewSize, minZoom, maxZoom, damping }) {
    this.viewSize = viewSize;
    this.camera = new THREE.OrthographicCamera(-viewSize, viewSize, viewSize, -viewSize, 0.1, 5000);
    this.camera.position.set(150, 180, 150);
    this.camera.up.set(0, 1, 0);

    this.controls = new MapControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = damping;
    this.controls.screenSpacePanning = true;
    this.controls.minZoom = minZoom;
    this.controls.maxZoom = maxZoom;
    this.controls.target.set(0, 0, 0);
    this.controls.mouseButtons.LEFT = null;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.controls.update();
  }

  resize(width, height) {
    const aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.left = (-this.viewSize * aspect) / 2;
    this.camera.right = (this.viewSize * aspect) / 2;
    this.camera.top = this.viewSize / 2;
    this.camera.bottom = -this.viewSize / 2;
    this.camera.updateProjectionMatrix();
  }

  setEnabled(enabled) {
    this.controls.enabled = Boolean(enabled);
  }

  setLeftPanEnabled(enabled) {
    this.controls.mouseButtons.LEFT = enabled ? THREE.MOUSE.PAN : null;
  }

  getFocusWorld() {
    return Object.freeze({
      x: this.controls.target.x,
      z: this.controls.target.z,
    });
  }

  focusWorld(x, z) {
    const delta = new THREE.Vector3(x, 0, z).sub(this.controls.target);
    this.controls.target.add(delta);
    this.camera.position.add(delta);
    this.controls.update();
  }

  reset() {
    this.camera.position.set(150, 180, 150);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  update() {
    if (this.controls.enabled) {
      this.controls.update();
    }
  }

  dispose() {
    this.controls.dispose();
  }
}
