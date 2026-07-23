import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

const PORT = 5179;
const HOST = '127.0.0.1';
const OUTPUT_DIRECTORY = resolve('public/assets/impostors/trees');
const DOWNLOAD_NAME = 'tree-impostors.bundle.json';
const TIMEOUT_MS = 180_000;
const POLL_MS = 250;
const DEBUG_PORT = 9237;


class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((resolvePromise, reject) => {
      this.socket.addEventListener('open', resolvePromise, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${pending.method} failed: ${message.error.message}`));
      } else {
        pending.resolve(message.result ?? {});
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

  close() {
    this.socket.close();
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Chrome DevTools connection closed.'));
    }
    this.pending.clear();
  }
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

function spawnLogged(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  child.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
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

async function main() {
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
  ]);
  let chrome = null;
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
      '--enable-features=Vulkan',
      '--use-angle=swiftshader',
      `--remote-debugging-address=${HOST}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profileDirectory}`,
      'about:blank',
    ];
    if (process.platform === 'linux') browserArguments.unshift('--no-sandbox');
    chrome = spawnLogged(browser, browserArguments);
    const cdp = new CdpClient(await waitForDevTools(30_000));
    try {
      await cdp.call('Page.enable');
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
      await cdp.call('Page.navigate', { url });
      const bundlePath = join(downloadDirectory, DOWNLOAD_NAME);
      await waitForFile(bundlePath, TIMEOUT_MS);
      const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
      await writeAssets(bundle);
      log(`Wrote ${bundle.prototypes.length} tree impostor atlases to ${OUTPUT_DIRECTORY}.`);
    } finally {
      cdp.close();
    }
    return;
  } finally {
    chrome?.kill('SIGTERM');
    vite.kill('SIGTERM');
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[impostor-bake] Failed.', error);
  process.exitCode = 1;
});
