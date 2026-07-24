import './ProceduralWorkshopSurfaceEditor.css';
import {
  createSurfaceTextureSourceId,
  getSurfaceTextureDefaults,
  serializeSurfaceTextures,
  WORKSHOP_SURFACE_TEXTURE_SLOTS,
} from './ProceduralWorkshopTextureConfig.js';
import { prepareWorkshopAlbedo } from './ProceduralWorkshopTextureUpload.js';

function tabsMarkup() {
  return WORKSHOP_SURFACE_TEXTURE_SLOTS.map(({ key, label }, index) => `
    <button
      type="button"
      class="${index === 0 ? 'is-active' : ''}"
      data-surface-action="select"
      data-surface-slot="${key}"
      role="tab"
    >${label}</button>
  `).join('');
}

function emptyState() {
  return { sources: {}, slots: {} };
}

export class ProceduralWorkshopSurfaceEditor {
  constructor({ root, onChange, onStatus }) {
    this.root = root;
    this.onChange = onChange;
    this.onStatus = onStatus;
    this.activeSlot = WORKSHOP_SURFACE_TEXTURE_SLOTS[0].key;
    this.state = emptyState();

    root.innerHTML = `
      <fieldset class="workshop-surface-editor">
        <legend>
          Imported albedo by area
          <span>optional</span>
        </legend>
        <div class="workshop-surface-tabs" role="tablist" aria-label="Material areas">
          ${tabsMarkup()}
        </div>
        <div class="workshop-surface-source">
          <div class="workshop-surface-swatch" data-role="surface-swatch" aria-hidden="true">
            <span>Procedural</span>
          </div>
          <div class="workshop-surface-source__details">
            <strong data-role="surface-title">Walls</strong>
            <span data-role="surface-file">Procedural material</span>
            <div class="workshop-surface-source__actions">
              <button type="button" class="action-button" data-surface-action="load">Load image</button>
              <button type="button" class="action-button" data-surface-action="clear" disabled>Use procedural</button>
            </div>
          </div>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            data-role="surface-file-input"
            hidden
          />
        </div>
        <div class="workshop-surface-options" data-role="surface-options">
          <label>Mapping
            <select data-surface-setting="mapping" disabled>
              <option value="repeat">Repeat tile</option>
              <option value="mirror">Mirror tile</option>
              <option value="clamp">Single image</option>
            </select>
          </label>
          <label>Rotation
            <select data-surface-setting="rotation" disabled>
              <option value="0">0°</option>
              <option value="90">90°</option>
              <option value="180">180°</option>
              <option value="270">270°</option>
            </select>
          </label>
          <span class="workshop-range workshop-range--wide">
            <label>
              Texture repeat
              <output data-role="surface-repeat-output">2.00×</output>
            </label>
            <input
              type="range"
              min="0.25"
              max="8"
              step="0.25"
              value="2"
              data-surface-setting="repeat"
              disabled
            />
          </span>
          <label class="workshop-surface-tint">Tint
            <input type="color" value="#ffffff" data-surface-setting="tint" disabled />
          </label>
        </div>
        <div class="workshop-surface-copy">
          <select data-role="surface-copy-target" aria-label="Copy texture to another area"></select>
          <button type="button" class="action-button" data-surface-action="copy" disabled>
            Copy texture + settings
          </button>
        </div>
        <p class="workshop-surface-help">
          Local PNG, JPEG, and WebP images are centre-cropped to 512 × 512, saved with the baked
          object, and reused when several areas share the same source.
        </p>
      </fieldset>
    `;

    this.fileInput = root.querySelector('[data-role="surface-file-input"]');
    this.swatch = root.querySelector('[data-role="surface-swatch"]');
    this.title = root.querySelector('[data-role="surface-title"]');
    this.fileName = root.querySelector('[data-role="surface-file"]');
    this.clearButton = root.querySelector('[data-surface-action="clear"]');
    this.copyButton = root.querySelector('[data-surface-action="copy"]');
    this.copyTarget = root.querySelector('[data-role="surface-copy-target"]');
    this.repeatOutput = root.querySelector('[data-role="surface-repeat-output"]');
    this.bind();
    this.render();
  }

  bind() {
    this.root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-surface-action]');
      if (!button) return;
      const action = button.dataset.surfaceAction;
      if (action === 'select') {
        this.activeSlot = button.dataset.surfaceSlot;
        this.render();
      } else if (action === 'load') {
        this.fileInput.click();
      } else if (action === 'clear') {
        this.clearActiveSlot();
      } else if (action === 'copy') {
        this.copyActiveSlot();
      }
    });

    this.fileInput.addEventListener('change', async (event) => {
      event.stopPropagation();
      const [file] = this.fileInput.files ?? [];
      this.fileInput.value = '';
      if (!file) return;
      await this.importFile(file);
    });

    this.root.addEventListener('change', (event) => {
      const setting = event.target.dataset.surfaceSetting;
      if (!setting) return;
      event.stopPropagation();
      this.updateSetting(setting, event.target.value);
    });

    this.root.addEventListener('input', (event) => {
      const setting = event.target.dataset.surfaceSetting;
      if (setting !== 'repeat' && setting !== 'tint') return;
      event.stopPropagation();
      this.updateSetting(setting, event.target.value);
    });
  }

  async importFile(file) {
    this.onStatus?.(`Preparing ${file.name}…`, false);
    try {
      const source = await prepareWorkshopAlbedo(file);
      let sourceId = createSurfaceTextureSourceId(source.dataUrl);
      let suffix = 2;
      while (
        this.state.sources[sourceId]
        && this.state.sources[sourceId].dataUrl !== source.dataUrl
      ) {
        sourceId = `${createSurfaceTextureSourceId(source.dataUrl)}-${suffix}`;
        suffix += 1;
      }
      this.commit({
        sources: {
          ...this.state.sources,
          [sourceId]: {
            name: source.name,
            dataUrl: source.dataUrl,
          },
        },
        slots: {
          ...this.state.slots,
          [this.activeSlot]: {
            ...getSurfaceTextureDefaults(this.activeSlot),
            ...this.state.slots[this.activeSlot],
            sourceId,
          },
        },
      });
      this.render();
      this.onStatus?.(`${source.name} applied to ${this.activeLabel()}.`, false);
      this.onChange?.();
    } catch (error) {
      this.onStatus?.(error instanceof Error ? error.message : String(error), true);
    }
  }

  updateSetting(setting, rawValue) {
    const current = this.state.slots[this.activeSlot];
    if (!current) return;
    const value = setting === 'repeat' || setting === 'rotation'
      ? Number(rawValue)
      : rawValue;
    this.commit({
      sources: this.state.sources,
      slots: {
        ...this.state.slots,
        [this.activeSlot]: {
          ...current,
          [setting]: value,
        },
      },
    });
    this.render();
    this.onChange?.();
  }

  clearActiveSlot() {
    if (!this.state.slots[this.activeSlot]) return;
    const slots = { ...this.state.slots };
    delete slots[this.activeSlot];
    this.commit({ sources: this.state.sources, slots });
    this.render();
    this.onStatus?.(`${this.activeLabel()} returned to its procedural material.`, false);
    this.onChange?.();
  }

  copyActiveSlot() {
    const current = this.state.slots[this.activeSlot];
    if (!current) return;
    const target = this.copyTarget.value;
    const targets = target === 'all'
      ? WORKSHOP_SURFACE_TEXTURE_SLOTS.map(({ key }) => key)
      : [target];
    const slots = { ...this.state.slots };
    for (const slotKey of targets) {
      if (slotKey !== this.activeSlot) {
        slots[slotKey] = { ...current };
      }
    }
    this.commit({ sources: this.state.sources, slots });
    this.render();
    this.onStatus?.('The imported albedo and its mapping settings were copied.', false);
    this.onChange?.();
  }

  commit(nextState) {
    this.state = serializeSurfaceTextures(nextState);
  }

  activeLabel() {
    return WORKSHOP_SURFACE_TEXTURE_SLOTS.find(({ key }) => key === this.activeSlot)?.label
      ?? this.activeSlot;
  }

  renderCopyTargets() {
    const previous = this.copyTarget.value;
    const options = WORKSHOP_SURFACE_TEXTURE_SLOTS
      .filter(({ key }) => key !== this.activeSlot)
      .map(({ key, label }) => `<option value="${key}">${label}</option>`);
    options.push('<option value="all">All other areas</option>');
    this.copyTarget.innerHTML = options.join('');
    if (Array.from(this.copyTarget.options).some(({ value }) => value === previous)) {
      this.copyTarget.value = previous;
    }
  }

  render() {
    const slot = this.state.slots[this.activeSlot] ?? null;
    const source = slot ? this.state.sources[slot.sourceId] : null;
    const defaults = getSurfaceTextureDefaults(this.activeSlot);
    const settings = slot ?? defaults;

    for (const button of this.root.querySelectorAll('[data-surface-action="select"]')) {
      button.classList.toggle('is-active', button.dataset.surfaceSlot === this.activeSlot);
      button.setAttribute('aria-selected', String(button.dataset.surfaceSlot === this.activeSlot));
    }

    this.title.textContent = this.activeLabel();
    this.fileName.textContent = source?.name ?? 'Procedural material';
    this.swatch.style.backgroundImage = source ? `url("${source.dataUrl}")` : '';
    this.swatch.classList.toggle('has-texture', Boolean(source));
    this.swatch.querySelector('span').textContent = source ? '' : 'Procedural';

    for (const control of this.root.querySelectorAll('[data-surface-setting]')) {
      control.disabled = !slot;
    }
    this.root.querySelector('[data-surface-setting="mapping"]').value = settings.mapping;
    this.root.querySelector('[data-surface-setting="rotation"]').value = String(settings.rotation);
    this.root.querySelector('[data-surface-setting="repeat"]').value = String(settings.repeat);
    this.root.querySelector('[data-surface-setting="tint"]').value = settings.tint;
    this.repeatOutput.textContent = `${Number(settings.repeat).toFixed(2)}×`;

    this.clearButton.disabled = !slot;
    this.copyButton.disabled = !slot;
    this.copyTarget.disabled = !slot;
    this.renderCopyTargets();
  }

  toDocument() {
    return serializeSurfaceTextures(this.state);
  }

  dispose() {
    this.root.replaceChildren();
    this.state = emptyState();
  }
}
