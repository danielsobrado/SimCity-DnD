import assert from 'node:assert/strict';
import test from 'node:test';
import { FrameRateMeter } from '../src/editor/performance/FrameRateMeter.js';

function approximately(actual, expected, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

test('reports frames divided by elapsed active time', () => {
  const meter = new FrameRateMeter({ windowMs: 2000, minSampleMs: 500 });
  let average = null;

  for (let frame = 0; frame <= 120; frame += 1) {
    average = meter.record(frame * (1000 / 60));
  }

  approximately(average, 60);
});

test('uses the real elapsed time for irregular frame cadence', () => {
  const meter = new FrameRateMeter({ windowMs: 1000, minSampleMs: 100 });
  const timestamps = [0, 20, 40, 80, 100, 140, 160, 200, 240, 300, 340, 400, 500];
  let average = null;

  for (const timestamp of timestamps) {
    average = meter.record(timestamp);
  }

  approximately(average, 24);
});

test('drops old samples outside the rolling window', () => {
  const meter = new FrameRateMeter({ windowMs: 500, minSampleMs: 100 });
  let average = null;

  for (let timestamp = 0; timestamp <= 500; timestamp += 10) {
    meter.record(timestamp);
  }
  for (let timestamp = 1000; timestamp <= 1500; timestamp += 100) {
    average = meter.record(timestamp);
  }

  approximately(average, 10);
});

test('resets on non-monotonic timestamps and explicit suspension', () => {
  const meter = new FrameRateMeter({ windowMs: 1000, minSampleMs: 100 });
  meter.record(0);
  meter.record(100);
  assert.equal(meter.record(50), null);
  assert.equal(meter.record(150), 10);

  meter.reset();
  assert.equal(meter.record(200), null);
});
