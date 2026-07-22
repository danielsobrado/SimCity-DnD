/**
 * Headless runner for the in-app Perf QA harness.
 *
 * Prerequisites: `npm run dev` already serving the app.
 *
 * Usage:
 *   npm run qa:perf
 *   npm run qa:perf -- --qa chunk-cross --duration 12 --warmup 2
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'tmp');

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const baseUrl = readArg('url', 'http://localhost:5173');
const scenario = readArg('qa', 'chunk-cross');
const duration = readArg('duration', '12');
const warmup = readArg('warmup', '2');
const speed = readArg('speed', 'run');
const hitchMs = readArg('hitchMs', '33.3');
const timeoutMs = Number(
  readArg('timeoutMs', String((Number(warmup) + Number(duration) + 90) * 1000)),
);

const query = new URLSearchParams({
  qa: scenario,
  duration,
  warmup,
  speed,
  hitchMs,
  download: '0',
  autostart: '1',
});
const targetUrl = `${baseUrl.replace(/\/$/, '')}/?${query.toString()}`;
const outPath = path.join(outDir, 'perf-qa-latest.json');
const runnerPath = path.join(outDir, 'perf-qa-playwright-runner.cjs');

fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(
  runnerPath,
  `
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: ${hasFlag('headed') ? 'false' : 'true'},
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(${timeoutMs});
  await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__perfQa && window.__perfQa.status === 'done', null, {
    timeout: ${timeoutMs},
  });
  const report = await page.evaluate(() => window.__perfQa.getReport());
  fs.writeFileSync(${JSON.stringify(outPath.replace(/\\/g, '/'))}, JSON.stringify(report, null, 2) + '\\n');
  console.log(JSON.stringify({
    outPath: ${JSON.stringify(outPath.replace(/\\/g, '/'))},
    scenario: report.scenario?.id,
    avgFps: report.summary.avgFps,
    hitchCount: report.summary.hitchCount,
    dt: report.summary.dt,
    counters: report.counters,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`,
);

console.log(`Running Perf QA: ${targetUrl}`);

await new Promise((resolve, reject) => {
  const child = spawn(
    'npx',
    ['--yes', '-p', 'playwright', 'node', runnerPath],
    { cwd: root, stdio: 'inherit', shell: true },
  );
  child.on('exit', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`Perf QA runner exited with code ${code}`));
  });
});
