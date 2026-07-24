# Testing, QA, and Acceptance Plan

## 1. Objective

Create deterministic automated and headed acceptance coverage for domain state, structural planning, masonry, geometry, streaming, collision, editing, and visual quality.

## 2. Test pyramid

### Unit

Pure deterministic functions:

- schema validation;
- path math;
- module planning;
- interval packing;
- course solving;
- stone generation;
- damage profiles;
- LOD selection;
- cache keys.

### Integration

Subsystem boundaries:

- save/load;
- terrain profile to foundation;
- construction command to dirty range;
- worker request/result;
- geometry replacement;
- collision/navigation update;
- floating-origin conversion.

### Headed acceptance

Real browser/WebGPU scene:

- placement;
- editing;
- visual captures;
- LOD transitions;
- streaming;
- performance;
- damage and repair.

## 3. Deterministic fixtures

Keep small fixtures as JSON:

```text
test/fixtures/construction/
  straight-flat.json
  l-corner-slope.json
  gate-arch.json
  t-junction.json
  damaged-breach.json
```

Fixtures include:

- construction record;
- style/version;
- terrain samples or deterministic terrain seed;
- expected hashes;
- expected counts/ranges.

Avoid snapshotting giant vertex arrays in source control.

## 4. Domain tests

- record validation;
- command validation;
- command inverse;
- save round trip;
- schema migration;
- style version pin;
- feature anchor edit behavior;
- construction spatial index;
- deletion cleanup.

## 5. Structural tests

- straight path;
- closed path;
- near-collinear simplification;
- acute/obtuse corner;
- T/cross junction;
- feature reservation;
- buttress distribution;
- exact crenellation rhythm;
- foundation step ownership;
- stable module IDs.

## 6. Masonry tests

Invariants:

- exact region fill tolerance;
- no stone overlap;
- minimum joint width;
- valid dimensions;
- no inverted shape;
- staggered joints;
- bounded pinning rate;
- quoin handshake;
- arch wedge coverage;
- deterministic hash;
- bounded retry/fallback.

Use property-based style loops with many deterministic seeds even if no external property-test library is added.

## 7. Geometry tests

- finite attributes;
- valid index range;
- correct typed index;
- non-empty required LOD;
- bounds contain vertices;
- normal length sanity;
- hard cap enforcement;
- hidden face policy;
- geometry disposal;
- material sharing;
- stable hash.

## 8. Terrain tests

- flat;
- constant slope;
- noisy slope;
- cliff rejection;
- retaining wall;
- chunk boundary;
- shared edge;
- terrain edit invalidation;
- foundation depth cap;
- no step chatter.

## 9. Collision/navigation tests

- no endpoint leak;
- corner continuity;
- gate state;
- breach state;
- delete cleanup;
- local update only;
- canonical query across rebase;
- navigation blocker/portal parity;
- no per-stone colliders.

## 10. Editor tests

- draw commit;
- cancel;
- undo/redo;
- point insertion;
- feature placement;
- snapping;
- invalid warning;
- floating-origin rebase while selected;
- selection pick proxy;
- no command spam during drag.

## 11. Streaming tests

- load/unload hysteresis;
- near/medium/far residency;
- stale worker result discarded;
- revision cancellation;
- cache hit/miss;
- memory cap eviction;
- rapid camera travel;
- repeated border crossing;
- selected wall priority.

## 12. Visual battery

Deterministic camera poses:

1. straight wall near;
2. corner near;
3. gate near;
4. slope/foundation;
5. wall top;
6. damaged breach;
7. wet/mossy wall;
8. medium LOD;
9. far silhouette;
10. LOD transition sequence.

Lighting variants:

- clear directional sun;
- soft/overcast;
- low-angle light;
- optional wet state.

## 13. Visual gates

Automated image comparison can catch regressions, but thresholds must tolerate renderer/platform differences.

Use a combination of:

- exact structural counters;
- geometry hashes;
- screenshot perceptual metrics;
- manual review gallery.

Never rely only on screenshot pixel equality.

## 14. Performance QA

Capture:

- frame dt p50/p95/p99/max;
- construction stage timings;
- render timings;
- draw calls;
- triangles;
- GPU errors;
- worker queue;
- upload spikes;
- memory estimates;
- cache behavior.

Scenarios:

- baseline no walls;
- one detailed wall;
- long wall;
- fortress;
- dense settlement;
- damage stress;
- edit stress;
- travel/streaming stress.

## 15. Acceptance thresholds

Set final thresholds after collecting baseline on target hardware.

Hard qualitative gates from day one:

- no NaN or GPU validation errors;
- no unbounded queue/cache growth;
- no whole-world refresh;
- no unrelated masonry reshuffle;
- no visible seam at chunk boundaries;
- no collision/visual breach disagreement;
- no LOD silhouette jump;
- no per-stone scene objects/materials/colliders.

## 16. CI

Add to existing verification:

```text
validate construction config
unit tests
integration tests
production build
determinism fixtures
```

Headed WebGPU visual/perf acceptance may run separately if CI lacks reliable physical WebGPU.

## 17. Failure artifacts

On failure, export:

- input construction;
- style;
- terrain samples;
- seed;
- structural dump;
- masonry dump for failed module;
- geometry stats;
- screenshot;
- performance report;
- browser/GPU details.

This allows local reproduction without the original save.

## 18. Milestone exit criteria

Each roadmap phase has:

- code complete;
- unit tests green;
- integration tests green;
- headed evidence where visual/runtime behavior changes;
- documentation updated;
- performance comparison against prior phase.
