import { FRAME_RATE_DECIMAL_PLACES } from './frameRateConstants.js';

export class FrameRateDisplay {
  constructor({ root }) {
    const header = root.querySelector('.sidebar-header');
    const title = header?.querySelector('h1');
    if (!header || !title) {
      throw new Error('Frame-rate display requires the editor title header.');
    }

    this.title = title;
    this.titleRow = document.createElement('div');
    this.titleRow.className = 'sidebar-title-row';
    title.before(this.titleRow);
    this.titleRow.append(title);

    this.output = document.createElement('output');
    this.output.className = 'fps-average';
    this.output.setAttribute('aria-label', 'Average frames per second');

    this.value = document.createElement('span');
    this.value.className = 'fps-average__value';
    this.label = document.createElement('span');
    this.label.className = 'fps-average__label';
    this.label.textContent = 'avg FPS';

    this.output.append(this.value, this.label);
    this.titleRow.append(this.output);
    this.update(null);
  }

  update(averageFps) {
    if (!Number.isFinite(averageFps) || averageFps < 0) {
      this.value.textContent = '—';
      this.output.title = 'Collecting the rolling average frame rate.';
      return;
    }

    const formatted = averageFps.toFixed(FRAME_RATE_DECIMAL_PLACES);
    this.value.textContent = formatted;
    this.output.title = `Average frame rate over the last two seconds: ${formatted} FPS.`;
  }

  dispose() {
    if (!this.titleRow.isConnected) {
      return;
    }
    this.titleRow.before(this.title);
    this.titleRow.remove();
  }
}
