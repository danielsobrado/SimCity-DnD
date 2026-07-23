import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

async function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;
  const exited = once(child, 'exit').then(() => true).catch(() => true);
  return Promise.race([
    exited,
    delay(timeoutMs).then(() => false),
  ]);
}

function terminateWindowsProcessTree(child) {
  execFileSync(
    'taskkill',
    ['/PID', String(child.pid), '/T', '/F'],
    { stdio: 'ignore' },
  );
}

export async function terminateChildProcess(child, { timeoutMs = 5_000 } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  try {
    if (process.platform === 'win32') {
      terminateWindowsProcessTree(child);
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // The process may have exited between the state check and termination.
  }

  if (await waitForExit(child, timeoutMs)) return;

  try {
    if (process.platform === 'win32') {
      terminateWindowsProcessTree(child);
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    // The process may already be gone.
  }
  await waitForExit(child, timeoutMs);
}

export async function removeDirectoryWithRetry(path) {
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: 12,
    retryDelay: 250,
  });
}
