import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  removeDirectoryWithRetry,
  terminateChildProcess,
} from '../scripts/lib/processLifecycle.mjs';

test('terminateChildProcess accepts an absent child', async () => {
  await terminateChildProcess(null);
});

test('removeDirectoryWithRetry removes a populated directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'process-lifecycle-test-'));
  await writeFile(join(directory, 'file.txt'), 'test');
  await removeDirectoryWithRetry(directory);
  await assert.rejects(() => writeFile(join(directory, 'other.txt'), 'test'), /ENOENT/);
});
