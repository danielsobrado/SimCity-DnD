const STATUS_LABELS = Object.freeze({
  disabled: 'Disabled in editor.config.yaml.',
  pending: 'Preparing editable GPU marching-cubes buffers…',
  unsupported: 'Unavailable: the active renderer is not using WebGPU.',
  failed: 'GPU marching-cubes initialization failed.',
});

function readNumber(input, fieldName) {
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a number.`);
  }
  return value;
}

export class VoxelPrototypeUi {
  constructor({ root, prototype, controller, stampStore }) {
    this.prototype = prototype;
    this.controller = controller;
    this.stampStore = stampStore;
    this.operation = 'subtract';
    this.panel = document.createElement('section');
    this.panel.className = 'panel';
    this.panel.innerHTML = `
      <h2>GPU voxel sculpting</h2>
      <button class="action-button action-button--wide" type="button" data-role="voxel-toggle">
        Marching-cubes chunk
      </button>
      <div class="terrain-mode-row" data-role="voxel-operation-row">
        <button class="tool-button" type="button" data-voxel-operation="add">Add</button>
        <button class="tool-button" type="button" data-voxel-operation="subtract">Dig</button>
        <button class="tool-button" type="button" data-voxel-operation="smooth">Smooth</button>
      </div>
      <label class="panel-note">X <input data-role="voxel-x" type="number" step="0.25" /></label>
      <label class="panel-note">Y <input data-role="voxel-y" type="number" step="0.25" /></label>
      <label class="panel-note">Z <input data-role="voxel-z" type="number" step="0.25" /></label>
      <label class="panel-note">Radius <input data-role="voxel-radius" type="number" min="0.25" step="0.25" /></label>
      <label class="panel-note">Strength <input data-role="voxel-strength" type="number" min="0" max="1" step="0.05" /></label>
      <label class="panel-note">Blend <input data-role="voxel-smoothness" type="number" min="0.01" step="0.05" /></label>
      <div class="action-grid">
        <button class="action-button" type="button" data-role="voxel-use-cursor">Use cursor</button>
        <button class="action-button" type="button" data-role="voxel-apply">Apply stamp</button>
        <button class="action-button action-button--danger" type="button" data-role="voxel-clear">Clear stamps</button>
      </div>
      <p class="panel-note" data-role="voxel-status"></p>
    `;

    this.toggleButton = this.panel.querySelector('[data-role="voxel-toggle"]');
    this.operationRow = this.panel.querySelector('[data-role="voxel-operation-row"]');
    this.xInput = this.panel.querySelector('[data-role="voxel-x"]');
    this.yInput = this.panel.querySelector('[data-role="voxel-y"]');
    this.zInput = this.panel.querySelector('[data-role="voxel-z"]');
    this.radiusInput = this.panel.querySelector('[data-role="voxel-radius"]');
    this.strengthInput = this.panel.querySelector('[data-role="voxel-strength"]');
    this.smoothnessInput = this.panel.querySelector('[data-role="voxel-smoothness"]');
    this.useCursorButton = this.panel.querySelector('[data-role="voxel-use-cursor"]');
    this.applyButton = this.panel.querySelector('[data-role="voxel-apply"]');
    this.clearButton = this.panel.querySelector('[data-role="voxel-clear"]');
    this.status = this.panel.querySelector('[data-role="voxel-status"]');

    const { layout } = prototype;
    this.xInput.min = 0;
    this.xInput.max = layout.cellsX;
    this.xInput.value = layout.cellsX / 2;
    this.yInput.min = 0;
    this.yInput.max = layout.cellsY;
    this.yInput.value = layout.baseHeight;
    this.zInput.min = 0;
    this.zInput.max = layout.cellsZ;
    this.zInput.value = layout.cellsZ / 2;
    this.radiusInput.value = layout.defaultRadius;
    this.strengthInput.value = layout.defaultStrength;
    this.smoothnessInput.value = layout.defaultSmoothness;

    this.onToggle = () => {
      prototype.toggle();
      this.render();
    };
    this.onOperation = (event) => {
      const button = event.target.closest('[data-voxel-operation]');
      if (!button) {
        return;
      }
      this.operation = button.dataset.voxelOperation;
      this.render();
    };
    this.onUseCursor = () => this.useHoveredCell();
    this.onApply = () => this.applyStamp();
    this.onClear = () => controller.clearVoxelStamps();

    this.toggleButton.addEventListener('click', this.onToggle);
    this.operationRow.addEventListener('click', this.onOperation);
    this.useCursorButton.addEventListener('click', this.onUseCursor);
    this.applyButton.addEventListener('click', this.onApply);
    this.clearButton.addEventListener('click', this.onClear);
    this.unsubscribeStamps = stampStore.subscribe(() => this.render());

    const sidebar = root.querySelector('.sidebar');
    const controlsPanel = sidebar?.querySelector('.help-list')?.closest('.panel');
    if (!sidebar) {
      throw new Error('Voxel prototype UI requires the editor sidebar.');
    }
    controlsPanel ? sidebar.insertBefore(this.panel, controlsPanel) : sidebar.append(this.panel);
    this.render();
  }

  useHoveredCell() {
    const hoveredCell = this.controller.hoveredCell;
    if (!hoveredCell) {
      this.controller.emitNotice('Move the cursor over the map first.', true);
      return;
    }

    const local = this.prototype.mapCellToVoxel(hoveredCell.x, hoveredCell.z);
    if (!local) {
      this.controller.emitNotice('The cursor is outside the voxel chunk.', true);
      return;
    }

    this.xInput.value = local.x.toFixed(2);
    this.zInput.value = local.z.toFixed(2);
  }

  applyStamp() {
    try {
      this.controller.addVoxelStamp({
        operation: this.operation,
        center: [
          readNumber(this.xInput, 'Voxel X'),
          readNumber(this.yInput, 'Voxel Y'),
          readNumber(this.zInput, 'Voxel Z'),
        ],
        radius: readNumber(this.radiusInput, 'Voxel radius'),
        strength: readNumber(this.strengthInput, 'Voxel strength'),
        smoothness: readNumber(this.smoothnessInput, 'Voxel blend'),
      });
    } catch (error) {
      this.controller.emitNotice(error.message, true);
    }
  }

  render() {
    const state = this.prototype.getStatus();
    this.toggleButton.disabled = !state.ready;
    this.applyButton.disabled = !state.ready || this.stampStore.size >= state.maxStamps;
    this.useCursorButton.disabled = !state.ready;
    this.clearButton.disabled = this.stampStore.size === 0;

    for (const button of this.operationRow.querySelectorAll('[data-voxel-operation]')) {
      button.classList.toggle('is-active', button.dataset.voxelOperation === this.operation);
    }

    if (!state.ready) {
      this.toggleButton.textContent = 'Marching cubes unavailable';
      this.status.textContent = state.error ?? STATUS_LABELS[state.code] ?? 'Unavailable.';
      return;
    }

    this.toggleButton.textContent = state.visible
      ? 'Hide marching-cubes chunk'
      : 'Show marching-cubes chunk';
    this.status.textContent = `${state.stampCount}/${state.maxStamps} sparse stamps · zero GPU readbacks`;
  }

  dispose() {
    this.toggleButton.removeEventListener('click', this.onToggle);
    this.operationRow.removeEventListener('click', this.onOperation);
    this.useCursorButton.removeEventListener('click', this.onUseCursor);
    this.applyButton.removeEventListener('click', this.onApply);
    this.clearButton.removeEventListener('click', this.onClear);
    this.unsubscribeStamps?.();
    this.panel.remove();
  }
}
