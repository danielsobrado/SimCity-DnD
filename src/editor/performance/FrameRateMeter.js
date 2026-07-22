import {
  FRAME_RATE_MIN_SAMPLE_MS,
  FRAME_RATE_WINDOW_MS,
} from './frameRateConstants.js';

function assertPositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
}

export class FrameRateMeter {
  constructor({
    windowMs = FRAME_RATE_WINDOW_MS,
    minSampleMs = FRAME_RATE_MIN_SAMPLE_MS,
  } = {}) {
    assertPositive(windowMs, 'Frame-rate window');
    assertPositive(minSampleMs, 'Frame-rate minimum sample');
    if (minSampleMs > windowMs) {
      throw new Error('Frame-rate minimum sample must not exceed the averaging window.');
    }

    this.windowMs = windowMs;
    this.minSampleMs = minSampleMs;
    this.timestamps = [];
  }

  record(timestamp) {
    if (!Number.isFinite(timestamp)) {
      return null;
    }

    const previous = this.timestamps.at(-1);
    if (previous !== undefined && timestamp <= previous) {
      this.reset();
    }

    this.timestamps.push(timestamp);
    const cutoff = timestamp - this.windowMs;
    while (this.timestamps.length > 2 && this.timestamps[1] <= cutoff) {
      this.timestamps.shift();
    }

    if (this.timestamps.length < 2) {
      return null;
    }

    const elapsedMs = timestamp - this.timestamps[0];
    if (elapsedMs < this.minSampleMs) {
      return null;
    }

    return ((this.timestamps.length - 1) * 1000) / elapsedMs;
  }

  reset() {
    this.timestamps.length = 0;
  }
}
