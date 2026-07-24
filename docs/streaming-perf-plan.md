# Streaming & chunk-loading performance plan

Tracks the work to reduce chunk-boundary stutter in player mode. Steady-state
walking is already smooth (p95 ≈ 7 ms); the pain is a **burst** when the focus
crosses a chunk boundary and several chunks become resident at once. See
`docs/perf-qa.md` for the measurement harness and the baseline finding
(spike train ~1049 → 340 → 290 ms while `loading` counted `6 → 0`).

## Root cause

When the focus chunk changes, `updateStreaming` assigns every newly-missing
slot in the same tick. Each assignment calls `worldStore.requestChunk`, which
hands work to a **single** generation worker. Six chunks therefore generate
one after another on one thread, and each finished page lands as a large async
`dt` on the next frame. The commit side is already cheap (worker builds render
pixels; main thread only does memcpy + `needsUpdate`), so the burst is
dominated by (a) serialized generation and (b) conservative drain pacing.

## Improvements (ranked)

| # | Change | Status | Notes |
|---|--------|--------|-------|
| 1 | Worker **pool** for chunk generation | ✅ Done | Parallelize the boundary burst across cores |
| 2 | Generation **request priority + cancellation** | ✅ Done | Enter-next chunk generates first; stale requests dropped |
| 3 | **Adaptive commit budget** | ✅ Done | More commits/frame when idle or backed up; stay at 1 while moving |
| 4 | **Memoize the streaming plan** | ✅ Done | Skip Map/freeze/sort churn when the focus & predicted chunks are unchanged |
| 5 | Worker vegetation scatter + attribute update ranges | ✅ Done | Grass/flower scatter built off-thread; GPU uploads use `updateRanges` |
| 6 | Budgeted tree/rock rebuild queues | ✅ Done | One heavy LOD rebuild per frame; trees no longer use a global rock signature |
| 7 | Distance LOD for far chunks | ⏳ Future | Downsampled heights, no stylized beyond radius 1; largest change |

Items 1–6 are implemented here. Item 7 remains a follow-up.

## Details

### 1. Worker pool

`WorldChunkWorkerClient` now owns an array of workers sized from
`navigator.hardwareConcurrency` (default `cores - 1`, clamped to 2..8, override
via the `workerCount` option). Requests are dispatched to the **least-busy**
worker (fewest in-flight jobs). The public API (`request`, `dispose`) is
unchanged, and the no-`Worker` fallback (Node/tests) still runs generation
synchronously. Each worker tags replies with its id so completions route back
correctly.

### 2. Request priority + cancellation

`request(chunkX, chunkZ, { priority })` accepts an optional priority (lower =
sooner). When every worker is saturated, pending requests wait in a
priority-ordered queue instead of FIFO, so the chunk the player is about to
step into is generated ahead of far prefetch chunks. `cancel(chunkX, chunkZ)`
drops a request that is still queued (not yet dispatched to a worker); it is a
no-op once generation has started. `InfiniteTerrainView.assignSlot` derives the
priority from Chebyshev distance to the focus chunk and forwards it through
`worldStore.requestChunk`.

### 3. Adaptive commit budget

`flushUploadQueue` now picks a per-frame commit budget from motion and backlog
instead of always using `maxCommitsPerFrame: 1`:

- **Moving** (focus speed above threshold): stay at the configured
  `maxCommitsPerFrame` (default 1) to protect frame time.
- **Idle / backed up**: allow up to `maxCommitsPerFrameIdle` (default 4) so a
  post-move backlog drains in a couple of frames instead of a dozen.

Knobs live in `world` config: `maxCommitsPerFrame`, `maxCommitsPerFrameIdle`,
`commitBudgetMs`.

### 4. Streaming plan memoization

`updateStreaming` computes the current and predicted chunk cheaply first and
builds a combined key. If neither changed since the last tick (and no `force`),
it only re-positions slots and returns — skipping the `selectTerrainResident-
Descriptors` Map build, per-cell descriptor freezes, and sort that previously
ran on every frame. This removes the steady-state allocation churn that shows
up as occasional GC hitches.

## Verifying

```bash
npm test                 # unit tests, incl. worker pool + priority queue
npm run qa:perf -- --qa chunk-cross --warmup 2 --duration 12 --speed run
npm run qa:perf:parse
```

Expect the chunk-cross spike train to shrink versus the ~1 s baseline, and
`terrainCommit` to stay small (memcpy only).

Unit coverage lives in `tests/WorldChunkWorkerClient.test.js` (pool dispatch,
priority ordering, cancellation, reprioritize, disposal). Run `npm test`
(139 passing at time of writing). `npm run build` requires the platform
`rolldown` native binary, so run the full `npm run verify` on your dev machine.
