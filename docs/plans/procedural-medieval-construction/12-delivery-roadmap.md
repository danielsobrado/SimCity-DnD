# Procedural Medieval Construction Delivery Roadmap

## 1. Delivery strategy

Implement one production-grade vertical slice, then expand styles and gameplay.

Do not build every medieval construction type in parallel.

Each phase must leave the project runnable and preserve legacy object behavior.

## Phase 0 — Baseline and contracts

### Deliverables

- capture current wall visual/performance baseline;
- document current object/save/render paths;
- add construction config schema draft;
- add deterministic RNG/hash utility or reuse existing stable utility;
- define canonical IDs and revisions;
- create construction QA fixture conventions.

### Files

```text
src/editor/construction/ConstructionSchema.js
src/editor/construction/ConstructionId.js
src/editor/construction/ConstructionRandom.js
config/construction.yaml
config/construction-styles.yaml
```

### Acceptance

- config validates;
- deterministic seed tests pass;
- no runtime behavior changed.

## Phase 1 — Construction domain and persistence

### Deliverables

- `ConstructionStore`;
- CRUD commands;
- canonical sparse records;
- spatial chunk index;
- save/load integration;
- legacy wall unaffected.

### Acceptance

- create/delete/save/reload simple wall path;
- no generated data in save;
- floating-origin invariant.

## Phase 2 — Path editor and preview shell

### Deliverables

- construction UI category;
- draw/edit/select;
- endpoint/grid/angle snapping;
- lightweight shell preview;
- undo/redo;
- basic terrain validation.

### Acceptance

- draw straight and polyline walls;
- edit without command spam;
- save/reload exact path.

## Phase 3 — Structural grammar

### Deliverables

- span decomposition;
- stable module IDs;
- corner ownership;
- simple T-junction;
- foundation/top semantic regions;
- coping and crenellation rhythm;
- debug overlays.

### Acceptance

- shell-only walls look structurally correct;
- no overlap/gaps at corners;
- local edit preserves unaffected module IDs.

## Phase 4 — Terrain and foundations

### Deliverables

- canonical terrain profile;
- stepped foundation solver;
- foundation modules;
- slope validation;
- terrain-change dirtying.

### Acceptance

- flat, slope, noisy terrain, and chunk-boundary fixtures pass;
- no foundation chatter or daylight gaps.

## Phase 5 — Coursed-rubble masonry

### Deliverables

- masonry regions;
- course solver;
- interval packing;
- joint staggering;
- field stones;
- ashlar end/corner quoins;
- pinnings;
- deterministic hashes.

### Acceptance

- exact fill and no-overlap invariants;
- believable near-wall layout;
- no distant reshuffle after local edit.

## Phase 6 — Near geometry and material

### Deliverables

- merged stone geometry;
- mortar backing;
- shared TSL stone material;
- palette and weathering parameters;
- render chunk lifecycle;
- pick proxies.

### Acceptance

- WebGPU compile;
- no material/object per stone;
- near visual battery approved;
- memory/disposal tests pass.

## Phase 7 — Gate and openings

### Deliverables

- gate feature editing;
- lintel or round arch;
- jamb/dressing stones;
- gate GLB socket;
- gate state;
- collision/navigation portal.

### Acceptance

- gate fits structural and masonry plans;
- open/closed collision and navigation agree;
- save/load state.

## Phase 8 — LOD and streaming

### Deliverables

- LOD 1 coarse masonry;
- LOD 2 semantic shell;
- projected-size selection;
- hysteresis/transition;
- worker compilation;
- priority scheduler;
- cache and memory policy;
- performance counters.

### Acceptance

- fortress fly-through meets measured budgets;
- no blink/silhouette jump;
- bounded queues and caches;
- no stale results.

## Phase 9 — Collision and navigation

### Deliverables

- coarse collision compiler;
- broad-phase index;
- gate/breach updates;
- navigation blocker/portal API;
- debug overlays.

### Acceptance

- no leaks at corners/endpoints;
- chunk/rebase queries pass;
- no collider per stone.

## Phase 10 — Damage and ruins

### Deliverables

- breach state;
- structural damage commands;
- local visual collapse;
- exposed core;
- debris budget;
- collision/navigation parity;
- repair.

### Acceptance

- damage/save/reload/repair deterministic;
- passability matches visible breach;
- unrelated spans unchanged.

## Phase 11 — Style expansion

### Deliverables

At least:

- village random rubble;
- castle coursed rubble;
- noble ashlar;
- limewashed village wall;
- ruined fortification;
- biome palettes.

### Acceptance

- styles require config/shared assets, not planner rewrites;
- gallery review;
- budget parity.

## Phase 12 — Broader medieval construction

Reuse the same architecture for:

- towers;
- gatehouses;
- retaining walls;
- bridges;
- stone houses;
- keeps;
- dungeons.

Each new type begins with a separate domain/grammar plan and shares masonry/material/compiler systems where valid.

## 2. Suggested dependency graph

```text
P0
 -> P1
 -> P2
 -> P3
 -> P4
 -> P5
 -> P6
 -> P7
 -> P8
 -> P9
 -> P10
 -> P11
 -> P12
```

Some work can overlap after contracts stabilize:

- material prototyping during P5;
- collision prototype during P3;
- QA harness from P0 onward;
- authored gate asset during P6.

## 3. Pull request slicing

Keep PRs reviewable:

1. schema/config;
2. store/persistence;
3. editor shell;
4. structural planner;
5. terrain foundation;
6. masonry data;
7. near renderer/material;
8. gate;
9. LOD/streaming;
10. collision/navigation;
11. damage;
12. styles/gallery.

Avoid one PR that combines domain, UI, worker, renderer, and material changes.

## 4. Documentation updates per phase

Every phase updates:

- this roadmap status;
- relevant design plan;
- config examples;
- test/QA commands;
- known limitations;
- performance evidence.

## 5. First implementation target

The highest-value next task is **Phase 0 + Phase 1**, followed by the lightweight Phase 2 preview.

Do not start detailed stone geometry before the construction record, stable IDs, path editing, and module boundaries are proven. Otherwise visual work will be rewritten when saving and editing requirements arrive.
