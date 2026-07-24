# LOD, Streaming, and Performance Plan

## 1. Objective

Render large fortified settlements and long walls without unbounded CPU generation, memory growth, draw calls, or frame spikes.

## 2. Performance model

Costs to control:

- path/terrain planning;
- masonry generation;
- geometry compilation;
- upload;
- draw calls;
- triangles;
- shadow rendering;
- culling;
- picking;
- collision/navigation updates;
- cache memory.

Every stage needs counters and budgets.

## 3. Spatial partitioning

A construction remains one logical record but produces multiple runtime chunks.

Partition by:

- world terrain chunk overlap;
- maximum path length;
- structural junctions;
- feature boundaries;
- maximum stones;
- maximum vertices;
- LOD independence.

Use expanded bounds so visible neighboring detail does not disappear at exact chunk edges.

## 4. Residency

Construction runtime products are resident around active cameras/player using load and unload hysteresis compatible with existing world streaming.

Suggested tiers:

- simulation metadata: broader radius;
- collision/navigation: gameplay radius;
- far render shell: visual radius;
- medium geometry: medium radius;
- near masonry: near radius;
- editor detail/debug: selected construction or developer override.

## 5. LOD tiers

### LOD 0 — detailed masonry

- individual merged stones;
- bevels;
- mortar recess;
- high silhouette fidelity;
- full opening dressings.

### LOD 1 — coarse masonry

- larger merged stone blocks or relief shell;
- reduced bevels;
- simplified rear face;
- preserved corners/openings/top.

### LOD 2 — semantic shell

- low-poly wall body;
- geometric buttresses, gates, towers, crenellations;
- material macro variation;
- no individual stones.

### LOD 3 — distant cluster

- simplified skyline/wall ribbon;
- major towers/gates;
- optional settlement-level proxy.

First release requires LOD 0–2.

## 6. LOD selection

Use projected screen size plus distance bounds and hysteresis.

Inputs:

- chunk bounding sphere;
- camera projection;
- renderer pixel ratio/render scale;
- selected/editing state;
- shadow policy;
- recent LOD.

Do not switch solely on world-chunk ring index if screen size gives better consistency across camera modes.

## 7. Transition strategy

Preferred order:

1. ensure silhouettes closely match;
2. use hysteresis;
3. use short dither/crossfade only if material pipeline supports it cleanly;
4. avoid long transparent fades that double cost.

Selected walls may pin near LOD within a reasonable editor distance.

## 8. Compilation scheduling

Priority:

1. visible invalid gameplay proxy;
2. selected/edited construction;
3. near visible chunk;
4. medium visible chunk;
5. far visible chunk;
6. prefetch direction;
7. offscreen cache warmup.

Scheduler requirements:

- fixed CPU budget per frame;
- fixed uploads per frame;
- cancellation by construction revision;
- stale result discard;
- no duplicate requests;
- worker queue backpressure.

## 9. Worker pipeline

Worker-safe stages:

- path interval calculations;
- structural module planning if terrain samples supplied;
- masonry course solver;
- stone descriptions;
- geometry typed-array compilation if implementation remains Three.js-independent.

Main thread:

- terrain sample acquisition where authority is main-thread-only;
- Three.js geometry/material creation;
- scene graph replacement;
- GPU upload lifecycle.

## 10. Cache keys

```text
constructionId
constructionRevision
styleKey
styleVersion
moduleRange
lod
materialFeatureSet
generatorVersion
```

Do not key only by construction ID.

Cache layers:

- structural plan;
- masonry description;
- geometry arrays;
- Three.js geometry;
- optional offline/generated asset cache later.

## 11. Dirty-range rebuild

Path edits map to path-distance ranges.

Expand dirty range to include:

- neighboring corner/junction;
- top rhythm interval;
- foundation step handshake;
- nearby feature clearance;
- render chunk boundary.

Unaffected chunks retain geometry and hashes.

## 12. Draw-call strategy

Target grouping:

- one or few shared stone materials;
- one mortar/core material;
- one debris material;
- semantic modules sharing style grouped where practical.

Do not create a material per construction or per stone.

A city wall should scale primarily by visible render chunks, not stone count.

## 13. GPU culling

Initial implementation can rely on Three.js object frustum culling per render chunk.

Only add compute-driven culling after profiling shows CPU/object culling is a real bottleneck.

Fine per-stone GPU culling is unnecessary because stones are merged and coherent.

## 14. Shadow policy

Configurable by LOD:

```yaml
lod:
  near:
    castShadow: true
  medium:
    castShadow: true
  far:
    castShadow: false
```

Towers/gates may keep far shadows separately.

## 15. Memory budgets

Track:

- authoritative construction bytes;
- structural plan bytes;
- masonry record bytes;
- CPU geometry bytes;
- GPU geometry bytes;
- active chunk count;
- cached chunk count;
- worker queue bytes.

Eviction order:

1. stale revisions;
2. distant near LOD;
3. distant medium LOD;
4. far shells beyond unload radius;
5. structural/masonry caches after geometry;
6. never evict authoritative save state.

## 16. Initial budgets

These are starting targets and must be validated on project hardware:

- no single construction compile task over one frame budget on main thread;
- upload count bounded per frame;
- detailed render chunk vertex cap configurable;
- construction CPU p95 tracked separately;
- no long-wall full rebuild from one local edit;
- no readbacks;
- zero unbounded object/material growth.

Do not freeze numeric production budgets until the QA scene establishes a measured baseline.

## 17. Perf counters

Add:

- resident constructions;
- resident render chunks by LOD;
- queued/active/cancelled compilation tasks;
- structural plan ms;
- masonry ms;
- geometry compile ms;
- upload ms;
- stones generated;
- vertices/triangles;
- draw calls;
- cache hit/miss;
- memory estimates;
- dirty range length;
- stale result drops.

## 18. QA scenes

- one 20 m wall;
- one 200 m wall;
- closed castle perimeter;
- dense town with many short walls;
- damaged fortress;
- terrain-crossing wall;
- rapid edit stress;
- camera fly-through;
- floating-origin travel;
- load/unload oscillation.

## 19. Acceptance

- no visible chunk gaps;
- no LOD blinking;
- no stale geometry after edits;
- bounded queues and caches;
- no frame-long synchronous rebuild;
- measured budgets pass in the main infinite-world scene.
