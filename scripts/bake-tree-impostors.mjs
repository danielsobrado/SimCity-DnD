import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const PORT = 5179;
const HOST = '127.0.0.1';
const OUTPUT_DIRECTORY = resolve('public/assets/impostors/trees');
const REPORT_PATH = resolve('docs/qa/offline-impostor-bake-status.md');
const DOWNLOAD_NAME = 'tree-impostors.bundle.json';
const TIMEOUT_MS = 180_000;
const POLL_MS = 250;
const DEBUG_PORT = 9237;
const MAX_DIAGNOSTIC_LINES = 240;

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolvePromise, reject) => {
      this.socket.addEventListener('open', resolvePromise, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`${pending.method} failed: ${message.error.message}`));
        } else {
          pending.resolve(message.result ?? {});
        }
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) {
        listener(message.params ?? {});
      }
    });
  }

  async call(method, params = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() {
    this.socket.close();
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Chrome DevTools connection closed.'));
    }
    this.pending.clear();
    this.listeners.clear();
  }
}

function appendDiagnostic(diagnostics, value) {
  const lines = String(value).split(/\r?\n/).filter(Boolean);
  diagnostics.push(...lines);
  if (diagnostics.length > MAX_DIAGNOSTIC_LINES) {
    diagnostics.splice(0, diagnostics.length - MAX_DIAGNOSTIC_LINES);
  }
}

function remoteObjectText(object) {
  if (object.value !== undefined) return String(object.value);
  return object.description ?? object.type ?? '<unknown>';
}

async function waitForDevTools(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://${HOST}:${DEBUG_PORT}/json/list`);
      if (response.ok) {
        const pages = await response.json();
        const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Browser DevTools endpoint is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_MS));
  }
  throw new Error(`Chrome DevTools did not become ready within ${timeoutMs}ms.`);
}

function log(message) {
  process.stdout.write(`[impostor-bake] ${message}\n`);
}

function candidates() {
  const fromEnvironment = [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
    process.env.CHROMIUM_PATH,
  ].filter(Boolean);
  if (process.platform === 'win32') {
    return [
      ...fromEnvironment,
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ];
  }
  if (process.platform === 'darwin') {
    return [
      ...fromEnvironment,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }
  return [
    ...fromEnvironment,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
}

function findBrowser() {
  const executable = candidates().find((candidate) => candidate && existsSync(candidate));
  if (!executable) {
    throw new Error('Chrome, Chromium or Edge was not found. Set CHROME_PATH to a browser executable.');
  }
  return executable;
}

function spawnLogged(command, args, diagnostics, options = {}) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  child.stdout?.on('data', (chunk) => {
    process.stdout.write(chunk);
    appendDiagnostic(diagnostics, chunk);
  });
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk);
    appendDiagnostic(diagnostics, chunk);
  });
  return child;
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_MS));
  }
  throw new Error(`Vite did not become ready within ${timeoutMs}ms.`);
}

async function waitForFile(path, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (existsSync(path) && !existsSync(`${path}.crdownload`)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_MS));
  }
  throw new Error(`Impostor bundle was not downloaded within ${timeoutMs}ms.`);
}

function decodeDataUrl(dataUrl) {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Impostor bundle contains an invalid PNG data URL.');
  return Buffer.from(match[1], 'base64');
}

async function writeAssets(bundle) {
  if (!Array.isArray(bundle.prototypes) || bundle.prototypes.length === 0) {
    throw new Error('Impostor bundle contains no tree prototypes.');
  }
  await rm(OUTPUT_DIRECTORY, { recursive: true, force: true });
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const prototypes = [];
  for (const source of bundle.prototypes) {
    const stem = `prototype-${source.prototypeIndex}`;
    const albedoFilename = `${stem}-albedo.png`;
    const normalFilename = `${stem}-normal.png`;
    await writeFile(join(OUTPUT_DIRECTORY, albedoFilename), decodeDataUrl(source.albedoDataUrl));
    await writeFile(join(OUTPUT_DIRECTORY, normalFilename), decodeDataUrl(source.normalDataUrl));
    prototypes.push({
      prototypeIndex: source.prototypeIndex,
      columns: source.columns,
      rows: source.rows,
      tileSize: source.tileSize,
      gutter: source.gutter ?? 0,
      lowElevationDegrees: source.lowElevationDegrees,
      highElevationDegrees: source.highElevationDegrees,
      width: source.width,
      height: source.height,
      depth: source.depth,
      centerY: source.centerY,
      radius: source.radius,
      albedo: `/assets/impostors/trees/${albedoFilename}`,
      normal: `/assets/impostors/trees/${normalFilename}`,
    });
  }
  await writeFile(
    join(OUTPUT_DIRECTORY, 'manifest.json'),
    `${JSON.stringify({ version: 1, generatedAt: bundle.generatedAt, prototypes }, null, 2)}\n`,
  );
}

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: resolve('.'),
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
}

function hasStagedChanges() {
  try {
    runGit(['diff', '--cached', '--quiet'], { capture: true });
    return false;
  } catch (error) {
    if (error.status === 1) return true;
    throw error;
  }
}

async function commitActionResult({ success, error = null, diagnostics = [] }) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  const errorText = error instanceof Error ? error.stack ?? error.message : String(error ?? '');
  const report = [
    '# Offline tree impostor bake',
    '',
    `- Run: ${process.env.GITHUB_RUN_ID ?? 'unknown'}`,
    `- Source: ${process.env.GITHUB_SHA ?? 'unknown'}`,
    `- Result: ${success ? 'success' : 'failure'}`,
    `- Generated assets: ${success ? 'yes' : 'no'}`,
    '',
    '## Error',
    '',
    '```text',
    errorText || 'None',
    '```',
    '',
    '## Diagnostics',
    '',
    '```text',
    ...diagnostics.slice(-MAX_DIAGNOSTIC_LINES),
    '```',
    '',
  ].join('\n');
  await writeFile(REPORT_PATH, report);

  runGit(['config', 'user.name', 'github-actions[bot]']);
  runGit(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  runGit(['add', REPORT_PATH]);
  if (success) runGit(['add', OUTPUT_DIRECTORY]);
  if (!hasStagedChanges()) return;

  runGit(['commit', '-m', success
    ? 'Add offline tree impostor atlases'
    : 'Record offline tree impostor bake failure']);
  runGit(['pull', '--rebase', 'origin', 'main']);
  runGit(['push', 'origin', 'HEAD:main']);
}

async function collectPageSnapshot(cdp, diagnostics) {
  try {
    const result = await cdp.call('Runtime.evaluate', {
      expression: `JSON.stringify({
        href: location.href,
        title: document.title,
        body: document.body?.innerText?.slice(0, 12000) ?? '',
        readyState: document.readyState
      })`,
      returnByValue: true,
    });
    appendDiagnostic(diagnostics, `Page snapshot: ${result.result?.value ?? '<unavailable>'}`);
  } catch (error) {
    appendDiagnostic(diagnostics, `Page snapshot failed: ${error.message}`);
  }
}

async function main(diagnostics) {
  const browser = findBrowser();
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'simcity-dnd-impostor-'));
  const downloadDirectory = join(temporaryRoot, 'downloads');
  const profileDirectory = join(temporaryRoot, 'profile');
  await mkdir(downloadDirectory, { recursive: true });
  await mkdir(join(profileDirectory, 'Default'), { recursive: true });
  await writeFile(join(profileDirectory, 'Default', 'Preferences'), JSON.stringify({
    download: {
      default_directory: downloadDirectory,
      prompt_for_download: false,
      directory_upgrade: true,
    },
    safebrowsing: { enabled: true },
  }));

  const vite = spawnLogged(process.execPath, [
    'node_modules/vite/bin/vite.js',
    '--host', HOST,
    '--port', String(PORT),
    '--strictPort',
  ], diagnostics);
  let chrome = null;
  let cdp = null;
  try {
    await waitForServer(`http://${HOST}:${PORT}/`, 30_000);
    log(`Vite is ready on ${HOST}:${PORT}.`);
    const url = `http://${HOST}:${PORT}/?bakeImpostors=1&download=1`;
    const browserArguments = [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-gpu-sandbox',
      '--enable-unsafe-webgpu',
      '--enable-dawn-features=allow_unsafe_apis',
      '--enable-features=Vulkan',
      '--use-angle=swiftshader',
      `--remote-debugging-address=${HOST}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profileDirectory}`,
      'about:blank',
    ];
    if (process.platform === 'linux') browserArguments.unshift('--no-sandbox');
    chrome = spawnLogged(browser, browserArguments, diagnostics);
    cdp = new CdpClient(await waitForDevTools(30_000));
    cdp.on('Runtime.consoleAPICalled', ({ type, args }) => {
      appendDiagnostic(diagnostics, `console.${type}: ${(args ?? []).map(remoteObjectText).join(' ')}`);
    });
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      const description = exceptionDetails?.exception?.description
        ?? exceptionDetails?.text
        ?? 'Unknown browser exception';
      appendDiagnostic(diagnostics, `Browser exception: ${description}`);
    });
    cdp.on('Log.entryAdded', ({ entry }) => {
      appendDiagnostic(diagnostics, `Browser log ${entry?.level ?? 'unknown'}: ${entry?.text ?? ''}`);
    });

    await Promise.all([
      cdp.call('Page.enable'),
      cdp.call('Runtime.enable'),
      cdp.call('Log.enable'),
    ]);
    const downloadBehavior = {
      behavior: 'allow',
      downloadPath: downloadDirectory,
      eventsEnabled: true,
    };
    try {
      await cdp.call('Browser.setDownloadBehavior', downloadBehavior);
    } catch {
      await cdp.call('Page.setDownloadBehavior', downloadBehavior);
    }
    const navigation = await cdp.call('Page.navigate', { url });
    if (navigation.errorText) throw new Error(`Page navigation failed: ${navigation.errorText}`);

    const bundlePath = join(downloadDirectory, DOWNLOAD_NAME);
    try {
      await waitForFile(bundlePath, TIMEOUT_MS);
    } catch (error) {
      await collectPageSnapshot(cdp, diagnostics);
      throw error;
    }
    const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
    await writeAssets(bundle);
    const validation = execFileSync(process.execPath, ['scripts/validate-impostors.mjs'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    appendDiagnostic(diagnostics, validation);
    log(`Wrote ${bundle.prototypes.length} tree impostor atlases to ${OUTPUT_DIRECTORY}.`);
    await commitActionResult({ success: true, diagnostics });
  } finally {
    cdp?.close();
    chrome?.kill('SIGTERM');
    vite.kill('SIGTERM');
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const diagnostics = [];
main(diagnostics).catch(async (error) => {
  console.error('[impostor-bake] Failed.', error);
  appendDiagnostic(diagnostics, error.stack ?? error.message ?? error);
  try {
    await commitActionResult({ success: false, error, diagnostics });
  } catch (commitError) {
    console.error('[impostor-bake] Failed to commit diagnostics.', commitError);
  }
  process.exitCode = 1;
});
