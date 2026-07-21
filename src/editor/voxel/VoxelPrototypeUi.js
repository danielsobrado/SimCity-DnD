const STATUS_LABELS = Object.freeze({
  disabled: 'Disabled in editor.config.yaml.',
  pending: 'Preparing GPU voxel buffers…',
  unsupported: 'Unavailable: the active renderer is not using WebGPU.',
  failed: 'GPU voxel initialization failed.',
});

export class VoxelPrototypeUi {
  constructor({ root, prototype }) {
    this.prototype = prototype;
    this.panel = document.createElement('section');
    this.panel.className = 'panel';
    this.panel.innerHTML = `
      <h2>GPU voxel prototype</h2>
      <button class="action-button action-button--wide" type="button" data-role="voxel-toggle">
        Voxel chunk
      </button>
      <p class="panel-note" data-role="voxel-status"></p>
    `;
    this.button = this.panel.querySelector('[data-role="voxel-toggle"]');
    this.status = this.panel.querySelector('[data-role="voxel-status"]');
    this.onToggle = () => {
      prototype.toggle();
      this.render();
    };
    this.button.addEventListener('click', this.onToggle);

    const sidebar = root.querySelector('.sidebar');
    const controlsPanel = sidebar?.querySelector('.help-list')?.closest('.panel');
    if (!sidebar) {
      throw new Error('Voxel prototype UI requires the editor sidebar.');
    }
    controlsPanel ? sidebar.insertBefore(this.panel, controlsPanel) : sidebar.append(this.panel);
    this.render();
  }

  render() {
    const state = this.prototype.getStatus();
    this.button.disabled = !state.ready;

    if (!state.ready) {
      this.button.textContent = 'Voxel chunk unavailable';
      this.status.textContent = state.error ?? STATUS_LABELS[state.code] ?? 'Unavailable.';
      return;
    }

    this.button.textContent = state.visible ? 'Hide voxel chunk' : 'Show voxel chunk';
    this.status.textContent = `${state.cells.join('×')} cells · indirect draw · zero GPU readbacks`;
  }

  dispose() {
    this.button.removeEventListener('click', this.onToggle);
    this.panel.remove();
  }
}
