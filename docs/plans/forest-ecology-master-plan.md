# Forest ecology and patch-aware tree plan

## Status

Implementation is split into independently reviewable pull requests. The existing tree rendering ladder remains authoritative:

1. full tree mesh;
2. reduced geometric proxy;
3. multi-view normal-mapped impostor;
4. extreme-distance canopy cluster;
5. culled.

The work in this plan changes the ecological placement authority and then improves the representations. It does not add a second tree renderer.

## Problem

Tree placement currently uses a fixed candidate count on eligible terrain IDs. Stable scatter and Matérn-II spacing make the result deterministic, but the density field is effectively uniform. This produces evenly scattered props, visible chunk patterns and forest biomes that differ mostly by terrain colour.

The target is a world with connected forests, fragmented woodland, groves, riparian belts, treelines and wetland stands. These structures must remain deterministic across chunk boundaries and must use the same canonical tree records at every LOD.

## Design principles

- Azgaar biome IDs remain the ecological authority.
- Forest patches are generated in canonical world coordinates, never chunk-local coordinates.
- Streaming order, view radius and approach direction must not change accepted trees.
- Density changes should reveal lower-priority trees without moving existing higher-priority trees.
- Near meshes, proxies, impostors and canopy clusters consume one immutable tree record.
- Generated forests are seed-derived. Persistence stores only edits such as felled, planted or burned trees.
- Runtime chunk builds never generate recursive L-system branch geometry.
- Procedural tree generation is an offline asset workflow for reusable prototypes and impostor atlases.
- No GPU visibility readback is introduced.

## Canonical forest inputs

A forest habitat sample combines:

```text
biome profile
patch coverage and edge
terrain elevation
terrain slope
water distance and wetness
road, structure and construction exclusions
stable candidate priority
```

The first implementation delivers biome, patch, elevation and slope authority. Water, roads and construction exclusions follow through provider interfaces so they do not become hard dependencies of the pure field code.

## Canonical tree record

Every accepted tree should eventually expose:

```text
stableId
patchId
ownerChunkX
ownerChunkZ
speciesId
prototypeIndex
ageClass
x, y, z
rotationY
heightScale
trunkScale
crownScale
spacingRadius
priority
colourSeed
windSeed
habitatFlags
```

Phase 1 adds patch and habitat metadata to the existing placement record without changing the LOD consumer contract.

## Biome structures

| Azgaar biome | Initial structure |
|---|---|
| Savanna | Sparse groves and stronger riparian density |
| Grassland | Rare copses, river woods and windbreaks |
| Tropical seasonal forest | Dense patches separated by dry clearings |
| Temperate deciduous forest | Fragmented woodland with strong edges |
| Tropical rainforest | Large connected closed forest |
| Temperate rainforest | Dense moist valley forest |
| Taiga | Conifer bands controlled by slope and treeline |
| Tundra | Future shrub and stunted-tree transition |
| Wetland | Tree islands on suitable raised ground |

Custom Azgaar biomes receive explicit profiles when available. Unknown custom biomes remain tree-free until a profile is configured.

## Representation improvements

### Full mesh

- species and age variation;
- generated root collar or buttress geometry;
- detailed crown sway and leaf flutter;
- near shadows;
- terrain-aware grounding.

### Geometric proxy

Replace the single cone canopy with a generated low-poly proxy containing several crown lobes, a reduced trunk and primary branches. Preserve instance colour variation and coherent crown sway.

### Individual impostor

Keep the existing multi-view albedo and normal atlas path. Extend records with species, age, crown aspect, colour seed and wind phase.

### Patch canopy cluster

Replace one cluster per chunk with one or more clusters per disconnected patch component. Preserve clearings, patch edges, cross-chunk patch identity and emergent-tree silhouettes.

### Far terrain

Feed the forest habitat field into far-terrain colour and low-frequency canopy-normal modulation after geometry ends.

## Correlated forest floor

The same patch and edge fields will control:

- grass suppression in dense cores;
- flowers near clearings and edges;
- leaf litter or pine needles;
- shrubs and saplings;
- deadwood and fallen logs;
- wetland plants and exposed roots;
- bare soil around mature trunks.

Tree and ground-cover systems must not evaluate unrelated noise fields for the same ecological decision.

## Phase roadmap

### Phase 0 — QA and diagnostics

- document invariants and acceptance gates;
- add habitat, patch and rejection counters;
- add pure field inspection data;
- establish deterministic tests.

### Phase 1 — Habitat and patch authority

- add biome profiles;
- add deterministic world-space forest patches;
- add elevation and slope suitability;
- add optional water-distance provider contract;
- extend stable scatter with an optional candidate evaluator;
- attach patch metadata to tree placements;
- retain bounded per-chunk accepted counts.

### Phase 2 — Dense patch manifests and ecological exclusions

- expose all controls in YAML;
- raise candidate budgets with measured build limits;
- use variable crown spacing;
- add road, building, farm and construction masks;
- add cached water-distance and wetness fields;
- add species and age selection.

### Phase 3 — Procedural species asset library

- generate deterministic L-system-style source prototypes offline;
- generate age and damage variants;
- generate root geometry;
- generate full and proxy meshes;
- bake and validate impostor atlases;
- emit asset metadata and source signatures.

### Phase 4 — Patch-aware LOD

- group placements by patch ID and connectivity;
- emit multiple canopy clusters per chunk where required;
- preserve cross-chunk colour and patch identity;
- add emergent-tree impostors;
- apply LOD-specific wind tiers;
- use actual patch or instance bounds for LOD selection.

### Phase 5 — Forest floor and understory

- drive grass, flowers and ground material from the habitat field;
- add shrubs, saplings, logs and deadwood;
- preserve clearings and forest-edge transitions.

### Phase 6 — Simulation edits

- persist felled and planted tree IDs;
- persist construction clearings and burned patch state;
- add deterministic regrowth hooks;
- expose patch summaries to resources, fire and wildlife simulation.

## Acceptance

### Determinism

- identical records from every approach direction;
- no chunk-boundary patch seams;
- no dependence on active LOD radius;
- no unrelated rebuilds after distant terrain edits;
- higher density reveals lower-priority candidates without moving existing trees.

### Visual

- no square chunk-density pattern from an aerial camera;
- disconnected groves remain disconnected at cluster LOD;
- forest biomes have recognisably different structures;
- steep slopes, roads, buildings and open water remain clear;
- canopy coverage and colour remain stable across LOD transitions.

### Performance

Run:

```bash
npm run verify
npm run qa:perf -- --qa move --warmup 2 --duration 12 --speed run
npm run qa:perf -- --qa strafe --warmup 2 --duration 12 --speed run
npm run qa:perf -- --qa diagonal --warmup 2 --duration 12 --speed run
npm run qa:perf -- --qa chunk-cross --warmup 2 --duration 20 --speed run
npm run qa:perf:parse
```

Acceptance requires bounded manifest work, bounded render buffers, zero silently dropped instances, zero WebGPU validation errors and no material movement-frame regression.