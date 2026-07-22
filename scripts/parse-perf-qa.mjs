import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const inputPath = path.resolve(process.argv[2] ?? path.join(root, 'tmp', 'perf-qa-latest.json'));
const outPath = path.join(root, 'tmp', 'perf-qa-latest.json');

fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
let data = raw.result?.value ?? raw.result?.result?.value ?? raw;
if (typeof data === 'string') {
  data = JSON.parse(data);
}

if (inputPath !== outPath) {
  fs.writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`);
}

const summary = data.summary ?? data;
const hitchFrames = data.hitchFrames ?? [];
const counters = data.counters ?? {};
const scenario = data.scenario ?? {};

console.log('=== PERF QA PARSE ===');
console.log(`scenario: ${scenario.id ?? '?'} ${scenario.speed ?? ''}`);
console.log(`frames: ${summary.frameCount}  durationMs: ${summary.durationMs}  avgFps: ${summary.avgFps}`);
console.log(`dt p50/p95/p99/max: ${summary.dt?.p50Ms} / ${summary.dt?.p95Ms} / ${summary.dt?.p99Ms} / ${summary.dt?.maxMs}`);
console.log(`hitches: ${summary.hitchCount}  rate: ${summary.hitchRate}`);
console.log(`counters: ${JSON.stringify(counters)}`);
console.log(`phase max stylized/render: ${summary.phases?.stylized?.maxMs} / ${summary.phases?.render?.maxMs}`);
console.log(`hitch dts: ${hitchFrames.map((frame) => frame.dtMs).join(', ')}`);

const loadingHitches = hitchFrames
  .filter((frame) => (frame.streaming?.loading ?? 0) > 0)
  .map((frame) => `${frame.index}:${frame.dtMs}ms load=${frame.streaming.loading} focus=${frame.streaming.focusChunk}`);
console.log(`hitch while streaming loads: ${loadingHitches.join(' | ') || '(none)'}`);

console.log(`source: ${inputPath}`);
console.log(`report: ${outPath} (${fs.statSync(outPath).size} bytes)`);
