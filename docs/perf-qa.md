# Player movement performance QA

Deterministic harness for reproducing and measuring player-mode stutter while moving across the streamed world.

## Quick start

```bash
# Terminal 1 — app must already be serving
npm run dev

# Terminal 2 — headless Chromium run (writes tmp/perf-qa-latest.json)
npm run qa:perf

# Optional: print a short parse summary
npm run qa:perf:parse
```

Or open the app with query params (overlay + optional JSON download):

```text
http://localhost:5173/?qa=chunk-cross&warmup=2&duration=12&speed=run&download=0
```

When a run finishes, the report is available as:

- `tmp/perf-qa-latest.json` (CLI runner)
- `window.__perfQa.getReport()` / `window.__perfQaReport` (browser)
- automatic download when `download=1` (default in the browser)

## Query parameters

| Param | Default | Meaning |
|-------|---------|---------|
| `qa` | — | Scenario id, or `1` / `true` → `move` |
| `x`, `z` | `0` | Spawn pose (render-space) |
| `yaw`, `pitch` | `0` | Look angles in degrees |
| `warmup` | `2` | Seconds to settle streaming before measuring |
| `duration` | `12` (`20` for `chunk-cross`) | Measured motion seconds |
| `speed` | `run` | `walk` or `run` |
| `hitchMs` | `~33.3` | Frame-dt threshold that counts as a hitch |
| `autostart` | `1` | Start as soon as stylized assets are ready |
| `download` | `1` | Auto-download the JSON report when done |

### Scenarios

| Id | Behavior |
|----|----------|
| `move` | Hold forward (`W`, +Shift when running) |
| `strafe` | Hold right (`D`) |
| `diagonal` | Hold `W`+`D` |
| `chunk-cross` | Long forward run intended to cross chunk boundaries |

The harness enters walk mode at a fixed pose, bypasses pointer lock, and injects keys so runs are repeatable without mouse capture.

## What the report contains

Report kind: `simcity-dnd-perf-qa` (version `1`).

- **Scenario + config snapshot** — spawn, keys, hitch threshold, player/world/stylized knobs used for the run
- **Summary** — frame count, duration, avg FPS, dt min/p50/p95/p99/max/mean, hitch count/rate
- **Phase timings** — CPU time inside the animation loop for:
  - `player`
  - `floatingOrigin`
  - `streaming` (sync kickoff of `updateStreaming` only)
  - `stylized`
  - `voxel`
  - `render`
- **Counters** — totals for grass/flower/tree/rock rebuilds, terrain slot assigns/uploads, floating-origin snaps
- **Hitch frames** — every frame with `dt > hitchMs`, including phase breakdown, counter deltas, streaming/voxel/player snapshots
- **Samples** — downsampled frames, plus any hitch, expensive phase (≥8 ms), or non-empty counter-delta frame

## CLI scripts

| Script | Role |
|--------|------|
| `npm run qa:perf` | `scripts/run-perf-qa.mjs` — Playwright Chromium, waits for `window.__perfQa.status === 'done'`, writes `tmp/perf-qa-latest.json` |
| `npm run qa:perf:parse` | `scripts/parse-perf-qa.mjs` — prints a short summary from a report or CDP extract JSON |

Extra CLI flags for `qa:perf`:

```bash
npm run qa:perf -- --qa move --duration 8 --warmup 1 --speed walk --url http://localhost:5173
npm run qa:perf -- --headed
```

## Code map

| Path | Role |
|------|------|
| `src/editor/performance/qa/PerfQaHarness.js` | Orchestration, overlay, `window.__perfQa` |
| `src/editor/performance/qa/FrameProfiler.js` | Per-frame dt + phase marks |
| `src/editor/performance/qa/PerfCounters.js` | Global rebuild/upload counters |
| `src/editor/performance/qa/parseQaParams.js` | URL scenario parsing |
| `src/editor/performance/qa/buildPerfReport.js` | JSON report assembly |
| `src/main.js` | Phase marks around the live animation loop |
| `src/editor/player/PlayerController.js` | Harness input bypass (`setHarnessActive` / `setHarnessKeys` / `setPose`) |

Counters are incremented from stylized rebuild paths and terrain `assignSlot` / `uploadPage`.

## Attribution caveat

Frame `dt` comes from `requestAnimationFrame` timestamps. Long **async** main-thread work that finishes *between* frames (for example `assignSlot` → `uploadPage` after a worker fetch) shows up as a large `dt` on the *next* callback, while that hitch frame’s phase timers can look cheap.

So:

- Large `dt` + `terrainUploadPages` / `loading > 0` → treat as streaming/upload hitch
- Large `phases.stylized` (or other phase) on a sample → sync CPU cost inside that named section
- Expensive sync work on frame N can inflate `dt` on frame N+1

## Baseline finding (chunk-cross)

Captured against local Vite (`?qa=chunk-cross&warmup=2&duration=12&speed=run&hitchMs=33.3`) in the Cursor/Electron WebGPU host.

| Metric | Value |
|--------|-------|
| Avg FPS | ~100.9 |
| dt p50 / p95 / p99 | ~6.9 / 7.0 / 14 ms |
| Max dt | ~1048 ms |
| Hitches (`>33.3` ms) | 11 (~0.91% of frames) |

**Counters (one run):** 9 grass, 6 flower, 1 tree, 1 rock rebuilds; 7 terrain assigns; 7 terrain uploads; 0 floating-origin snaps.

### Interpretation

1. Steady-state walking is smooth (p95 ≈ 7 ms).
2. The stutter reproduces as a **chunk-boundary streaming spike**, not continuous grass/player CPU.
3. Strongest hitch cluster (~frames 1107–1113): focus moved `0:0 → 0:1`, `loading` counted down `6 → 0`, and each hitch coincided with `terrainUploadPages` increments. Spike train roughly **1049 → 340 → ~290 ms**.
4. Early hitches (~150–250 ms) appeared right after the measure phase began (post-warmup settle).
5. Phase timers on those hitch frames stayed small (~2–14 ms), which matches async upload work completing outside the marked loop body.
6. `stylized` phase max reached ~948 ms once (rebuild spike); keep samples that include counter deltas / expensive phases when diagnosing rebuild cost.

### Next fix target

Amortize or defer terrain `uploadPage` / slot assignment work so worker completions do not block the next animation frame when the player crosses chunk boundaries.
