# Forest ecology pull-request sequence

Each pull request must remain independently testable and must preserve the existing tree LOD ladder. Later PRs may depend on earlier merged phases, but a PR must not mix unrelated renderer, asset and simulation work.

## PR 1 — Habitat and patch foundation

**Branch:** `agent/forest-habitat-phase-1`

Deliver:

- master plan and PR sequence;
- biome profile registry;
- deterministic world-space forest patch field;
- elevation and slope habitat factors;
- optional water-distance provider contract;
- optional stable-scatter candidate evaluator;
- patch metadata on accepted tree placements;
- candidate and patch QA counters;
- pure deterministic tests.

Constraints:

- accepted trees remain capped by the current `trees.perChunk` render capacity;
- no species asset changes;
- no canopy-cluster renderer changes;
- no recursive runtime branch generation.

## PR 2 — Dense manifests and exclusions

Deliver:

- YAML validation for forest controls;
- measured candidate and accepted-tree budgets;
- variable spacing by habitat and future species class;
- cached water-distance field;
- road, structure, farm and construction exclusion providers;
- forest debug visualisation modes;
- movement and chunk-cross QA evidence.

Exit gate:

- denser patch cores without buffer drops or manifest spikes;
- no trees in excluded water, road or construction regions.

## PR 3 — Species, age and procedural assets

Deliver:

- forest species registry;
- biome-weighted species selection;
- deterministic age classes;
- offline L-system-style tree prototype generator;
- root collars or buttress geometry;
- generated full and reduced proxy meshes;
- versioned asset metadata and validation;
- refreshed impostor atlases.

Exit gate:

- no runtime L-system work during streaming;
- all generated assets are reproducible and production-validated.

## PR 4 — Patch-aware canopy LOD

Deliver:

- connectivity grouping within each patch;
- multiple canopy clusters for disconnected groves;
- stable cross-chunk patch fragments;
- multi-lobe canopy geometry;
- emergent-tree impostors;
- patch-aware LOD bounds and transition tests.

Exit gate:

- clearings and separate groves remain visible through the cluster band;
- no chunk-shaped canopy blocks.

## PR 5 — LOD material and wind parity

Deliver:

- stable leaf and bark colour variation across representations;
- full, proxy, impostor and cluster wind tiers;
- proxy-to-impostor canopy coverage matching;
- shadow-distance policy;
- visual capture battery for editor and player cameras.

Exit gate:

- no visible lighting, colour or motion flip at LOD boundaries.

## PR 6 — Forest floor and understory

Deliver:

- shared habitat sampling for grass, flowers and terrain material;
- dense-core grass suppression;
- edge flowers and shrubs;
- biome-specific litter, needles and wetland cover;
- deterministic deadwood and fallen-log placement.

Exit gate:

- forest ground cover reads as one ecosystem rather than independent scatter layers.

## PR 7 — Persistent edits and simulation hooks

Deliver:

- sparse felled and planted tree overrides;
- construction clearing persistence;
- burn and regrowth state contracts;
- patch-level resource and wildlife summaries;
- save/load determinism tests.

Exit gate:

- save size scales with edits, not generated forest area.

## Required checks per PR

At minimum:

```bash
npm test
npm run build
```

Streaming, placement, LOD or residency changes also require:

```bash
npm run qa:perf -- --qa chunk-cross --warmup 2 --duration 20 --speed run
npm run qa:perf:parse
```

Asset changes require:

```bash
npm run validate:assets:production
```

Every PR description must record the measured counters or explicitly state which headed visual/performance evidence remains open.