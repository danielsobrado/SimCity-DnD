import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeModelParts } from '../assets/modelParts.js';

function randomSeed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] & 0x7fffffff;
}

export class ProceduralWorkshopUi {
  constructor({ root, manager, onBaked }) {
    this.root = root;
    this.manager = manager;
    this.onBaked = onBaked;
    this.previewParts = [];
    this.previewRoot = new THREE.Group();
    this.renderer = null;
    this.camera = null;
    this.controls = null;
    this.animationFrame = 0;

    root.insertAdjacentHTML('beforeend', `
      <div class="workshop-overlay" data-role="workshop-overlay" hidden>
        <section class="workshop-dialog" role="dialog" aria-modal="true" aria-labelledby="workshop-title">
          <header class="workshop-header">
            <div>
              <p class="workshop-eyebrow">Procedural object workshop</p>
              <h2 id="workshop-title">Medieval construction bench</h2>
              <p>Generate inside this bounded preview, then bake the result into the Objects palette.</p>
            </div>
            <button class="workshop-close" type="button" data-workshop-action="close" aria-label="Close workshop">×</button>
          </header>
          <div class="workshop-body">
            <form class="workshop-controls" data-role="workshop-form">
              <label>Game-object name
                <input name="label" value="Granite Gatehouse" maxlength="48" required />
              </label>
              <label>Build
                <select name="archetype">
                  <option value="wall">Wall</option>
                  <option value="gatehouse" selected>Gatehouse</option>
                  <option value="tower">Round tower</option>
                </select>
              </label>
              <label>Stone
                <select name="style">
                  <option value="granite">Grey granite</option>
                  <option value="limestone">Warm limestone</option>
                  <option value="sandstone">Red sandstone</option>
                </select>
              </label>
              <div class="workshop-field-grid">
                <label>Width (m)<input name="width" type="number" min="2" max="16" step="0.5" value="8" /></label>
                <label>Depth (m)<input name="depth" type="number" min="1" max="12" step="0.5" value="2" /></label>
                <label>Height (m)<input name="height" type="number" min="2" max="14" step="0.5" value="5" /></label>
                <label>Detail
                  <select name="detail">
                    <option value="1">Draft</option>
                    <option value="2" selected>High</option>
                    <option value="3">Ultra</option>
                  </select>
                </label>
              </div>
              <label>Deterministic seed
                <span class="workshop-inline">
                  <input name="seed" type="number" min="0" max="2147483647" step="1" value="1848" />
                  <button type="button" class="action-button" data-workshop-action="reroll">Reroll</button>
                </span>
              </label>
              <label class="workshop-check">
                <input name="remesh" type="checkbox" checked />
                Remesh into draw-call-efficient merged geometry
              </label>
              <label class="workshop-check">
                <input name="albedo" type="checkbox" checked />
                Bake a tileable stone albedo texture
              </label>
              <p class="workshop-status" data-role="workshop-status">Ready to generate.</p>
              <div class="workshop-actions">
                <button type="button" class="action-button" data-workshop-action="preview">Regenerate preview</button>
                <button type="submit" class="action-button workshop-bake">Bake game object</button>
              </div>
            </form>
            <div class="workshop-preview">
              <div class="workshop-preview__badge">16 × 16 m bounded work area</div>
              <div class="workshop-canvas" data-role="workshop-canvas"></div>
              <p>Drag to orbit · wheel to zoom. Baked placements share one mesh and material set.</p>
            </div>
          </div>
        </section>
      </div>
    `);

    this.overlay = root.querySelector('[data-role="workshop-overlay"]');
    this.form = root.querySelector('[data-role="workshop-form"]');
    this.canvasHost = root.querySelector('[data-role="workshop-canvas"]');
    this.status = root.querySelector('[data-role="workshop-status"]');
    this.bind();
  }

  bind() {
    this.overlay.addEventListener('click', (event) => {
      const action = event.target.closest('[data-workshop-action]')?.dataset.workshopAction;
      if (action === 'close') this.close();
      if (action === 'preview') this.generatePreview();
      if (action === 'reroll') {
        this.form.elements.seed.value = String(randomSeed());
        this.generatePreview();
      }
    });
    this.overlay.addEventListener('pointerdown', (event) => {
      if (event.target === this.overlay) this.close();
    });
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.bake();
    });
    this.form.addEventListener('change', () => this.generatePreview());
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.overlay.hidden) this.close();
    });
  }

  readInput() {
    const values = new FormData(this.form);
    return {
      label: values.get('label'),
      recipe: {
        archetype: values.get('archetype'),
        style: values.get('style'),
        width: Number(values.get('width')),
        depth: Number(values.get('depth')),
        height: Number(values.get('height')),
        detail: Number(values.get('detail')),
        seed: Number(values.get('seed')),
        remesh: values.get('remesh') === 'on',
        albedo: values.get('albedo') === 'on',
      },
    };
  }

  async open() {
    this.overlay.hidden = false;
    try {
      await this.ensureRenderer();
      this.generatePreview();
      this.renderLoop();
    } catch (error) {
      this.status.textContent = error.message;
      this.status.classList.add('is-error');
    }
  }

  close() {
    this.overlay.hidden = true;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
  }

  async ensureRenderer() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvasHost.clientWidth, this.canvasHost.clientHeight);
    this.renderer.setClearColor('#111713', 1);
    this.renderer.shadowMap.enabled = true;
    await this.renderer.init();
    this.canvasHost.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(this.previewRoot);
    this.camera = new THREE.PerspectiveCamera(
      38,
      this.canvasHost.clientWidth / this.canvasHost.clientHeight,
      0.1,
      100,
    );
    this.camera.position.set(13, 9, 15);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 3, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 35;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16, 16, 16),
      new THREE.MeshStandardMaterial({ color: '#28372d', roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.scene.add(new THREE.GridHelper(16, 16, '#738b76', '#34483a'));
    this.scene.add(new THREE.HemisphereLight('#cfe0ff', '#283122', 2.2));
    const sun = new THREE.DirectionalLight('#fff0ce', 3);
    sun.position.set(7, 14, 9);
    sun.castShadow = true;
    this.scene.add(sun);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvasHost);
  }

  resize() {
    if (!this.renderer || this.canvasHost.clientWidth === 0 || this.canvasHost.clientHeight === 0) {
      return;
    }
    this.renderer.setSize(this.canvasHost.clientWidth, this.canvasHost.clientHeight);
    this.camera.aspect = this.canvasHost.clientWidth / this.canvasHost.clientHeight;
    this.camera.updateProjectionMatrix();
  }

  generatePreview() {
    try {
      const { recipe } = this.readInput();
      const nextParts = this.manager.createPreviewParts(recipe);
      this.clearPreview();
      this.previewParts = nextParts;
      for (const part of nextParts) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        part.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.previewRoot.add(mesh);
      }
      const stats = nextParts.stats;
      this.status.textContent = `${stats.stones} stones · ${stats.sourceVertices.toLocaleString()} source vertices · ${stats.drawParts} baked mesh part${stats.drawParts === 1 ? '' : 's'}.`;
      this.status.classList.remove('is-error');
    } catch (error) {
      this.status.textContent = error.message;
      this.status.classList.add('is-error');
    }
  }

  bake() {
    try {
      const record = this.manager.create(this.readInput());
      this.status.textContent = `${record.label} baked and added to Objects.`;
      this.status.classList.remove('is-error');
      this.onBaked?.(record);
    } catch (error) {
      this.status.textContent = error.message;
      this.status.classList.add('is-error');
    }
  }

  clearPreview() {
    this.previewRoot.clear();
    disposeModelParts(this.previewParts);
    this.previewParts = [];
  }

  renderLoop() {
    if (this.overlay.hidden || !this.renderer) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(() => this.renderLoop());
  }

  dispose() {
    this.close();
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    this.clearPreview();
    this.renderer?.dispose();
    this.overlay.remove();
  }
}
