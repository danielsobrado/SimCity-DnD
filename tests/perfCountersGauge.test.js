import assert from 'node:assert/strict';
import test from 'node:test';
import { PerfCounters } from '../src/editor/performance/qa/PerfCounters.js';

test('performance gauges replace their previous value', () => {
  PerfCounters.reset();
  PerfCounters.set('treeProxyInstances', 12);
  PerfCounters.set('treeProxyInstances', 7);
  assert.equal(PerfCounters.get('treeProxyInstances'), 7);
});

test('performance gauges reject non-finite values', () => {
  assert.throws(() => PerfCounters.set('invalid', Number.NaN), /must be finite/);
});
