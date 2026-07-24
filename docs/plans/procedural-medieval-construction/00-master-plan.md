# Procedural Medieval Construction — Master Plan

## 1. Goal

Create a deterministic medieval construction system that begins with realistic stylized stone walls and can later support:

- village walls;
- castle curtain walls;
- keeps and towers;
- gates and gatehouses;
- retaining walls;
- bridges;
- ruins;
- foundations;
- stone houses;
- dungeons and underground masonry.

The first release must provide a complete vertical slice rather than an isolated visual demo.

## 2. Current gap

The existing wall is a one-cell object with a fixed footprint, quarter-turn rotation, procedural box fallback, and optional static GLB replacement.

That design has three useful properties:

- simple placement;
- predictable saving;
- efficient instancing.

It does not express:

- arbitrary-length walls;
- arbitrary angles;
- corners and T-junctions;
- structural openings;
- masonry courses;
- terrain steps;
- wall walks;
- damage or breaches;
- wall-specific collision;
- construction LOD;
- chunk-local streaming.

The plan retains the existing wall object only as a compatibility fallback and palette entry.

## 3. Architectural principles

### 3.1 Authoritative intent, derived geometry

The authoritative record contains path, style, dimensions, features, and gameplay state.

The following are derived and rebuildable:

- module decomposition;
- course layout;
- stone geometry;
- material attributes;
- render chunks;
- collision primitives;
- navigation blockers;
- debris scatter.

### 3.2 Deterministic at every stage

No generation path may use ambient `Math.random()`.

Every random choice derives from stable keys:

```text
worldSeed
constructionId
styleVersion
moduleId
generationStage
localIndex
```

Editing one span should not visually reshuffle unrelated spans.

### 3.3 Semantic hierarchy

Generation proceeds from large to small:

```text
path
  -> structural spans
  -> junctions and openings
  -> foundation and top profile
  -> masonry regions
  -> courses
  -> stones
  -> chips, wear, moss, and debris
```

Noise never decides structural topology.

### 3.4 Bounded runtime work

No frame may regenerate a whole city wall.

Compilation is:

- dirty-range based;
- chunked;
- asynchronous where practical;
- budgeted per frame;
- cancellable;
- cacheable;
- replace-in-place.

### 3.5 Stylized realism

The target is readable, believable medieval masonry, not photogrammetric complexity.

Priorities:

1. silhouette;
2. structural rhythm;
3. course and joint quality;
4. material response;
5. restrained weathering detail.

## 4. Proposed runtime components

```text
src/editor/construction/
  ConstructionStore.js
  ConstructionSchema.js
  ConstructionId.js
  ConstructionCommands.js
  ConstructionDirtyTracker.js
  ConstructionCompiler.js
  ConstructionView.js

src/editor/construction/wall/
  WallPath.js
  WallPathSampling.js
  WallModulePlanner.js
  WallJunctionSolver.js
  WallFeaturePlanner.js
  WallTerrainProfile.js

src/editor/construction/masonry/
  MasonryRegion.js
  MasonryCourseSolver.js
  MasonryJointRules.js
  StoneShapeGenerator.js
  StoneAttributeGenerator.js

src/editor/construction/render/
  ConstructionRenderChunk.js
  ConstructionGeometryCompiler.js
  ConstructionMaterialFactory.js
  ConstructionLodPolicy.js
  ConstructionRenderCache.js

src/editor/construction/simulation/
  ConstructionCollisionCompiler.js
  ConstructionNavigationCompiler.js
  ConstructionDamageModel.js
```

Keep files small and split responsibilities once a file begins coordinating unrelated policies.

## 5. Data flow

```text
UI command
  -> validate canonical edit
  -> mutate ConstructionStore
  -> mark affected path range dirty
  -> plan structural modules
  -> solve terrain/openings/junctions
  -> generate masonry description
  -> compile render/collision/nav outputs
  -> atomically replace old outputs
  -> persist authoritative construction
```

## 6. Main subsystems

### Construction store

Responsibilities:

- stable IDs;
- CRUD operations;
- canonical coordinates;
- versioned schema;
- sparse persistence;
- command history;
- dirty notifications.

It must not generate geometry.

### Wall path and editor

Responsibilities:

- draw and edit paths;
- snap endpoints;
- preview validity;
- place features by path distance;
- resolve canonical coordinates through floating origin;
- emit commands.

It must not directly create meshes.

### Structural planner

Responsibilities:

- split paths into spans;
- classify corners and intersections;
- reserve gate and tower intervals;
- choose buttress spacing;
- create top/foundation profiles;
- produce stable module IDs.

### Masonry generator

Responsibilities:

- divide module faces into masonry regions;
- solve horizontal courses;
- stagger joints;
- create larger foundation/corner stones;
- fill residual gaps;
- assign stone attributes.

It must not know renderer internals.

### Geometry compiler

Responsibilities:

- convert masonry descriptions into bounded indexed geometry;
- deduplicate vertices where useful;
- create per-vertex/per-stone attributes;
- build LOD variants;
- compute bounds;
- keep draw-call count bounded.

### Simulation products

Responsibilities:

- coarse collision;
- navigation blockers and portals;
- cover/defense metadata;
- breach state;
- construction progress;
- repair state.

Simulation never depends on individual render stones.

## 7. Reuse of existing repository systems

### Infinite coordinates and floating origin

Store construction points in canonical world coordinates. Convert only at view/render boundaries.

### Chunk streaming

Index constructions by the chunks touched by their expanded bounds. A long wall may be referenced by many chunks while retaining one construction ID.

### Existing object catalog

Keep the current `wall` key for compatibility. Add a new construction tool and construction style catalog rather than overloading `objects.yaml` with path-based semantics.

### Existing foundation evaluation

Reuse terrain sampling concepts, but wall foundations need a path profile rather than one rectangular footprint evaluation.

### Existing asset pipeline

GLB modules remain valuable for:

- gates;
- doors;
- portcullises;
- tower roofs;
- statues;
- banners;
- authored decorative caps.

Procedural wall bodies must not require a unique GLB per generated span.

### Existing WebGPU renderer

Use `three/webgpu` and TSL/NodeMaterial. Avoid new `ShaderMaterial` dependencies because the project is WebGPU-first.

## 8. Non-goals for the first release

- physically simulated individual bricks;
- arbitrary free-form curved masonry surfaces;
- fully destructible rigid-body rubble;
- automatic full-castle generation;
- multiplayer replication;
- production-quality interior rooms;
- procedural roofs beyond gate/tower interfaces;
- GPU-only authoritative generation;
- runtime CSG for every opening.

## 9. First vertical slice

The first accepted slice includes:

- straight and polyline wall paths;
- arbitrary horizontal angle;
- deterministic coursed-rubble style;
- ashlar ends and corners;
- stepped foundations;
- crenellated or coping top;
- one gate opening type;
- merged near geometry;
- simplified medium and far LOD;
- coarse collision and navigation blocking;
- save/load;
- selection and editing;
- deterministic tests;
- headed visual and performance acceptance.

## 10. Risks

### Risk: excessive geometry

Mitigation:

- hard budgets;
- adaptive stone scale;
- merged render chunks;
- medium LOD shell;
- distance-based compile priority.

### Risk: edit ripple

Mitigation:

- stable module IDs;
- local seeds;
- fixed anchor stones at region boundaries;
- dirty-range rebuilds.

### Risk: terrain discontinuities

Mitigation:

- canonical terrain profile;
- explicit step placement;
- neighboring span handshake;
- foundation validation before masonry.

### Risk: visually procedural repetition

Mitigation:

- style ranges;
- per-region pattern variation;
- bounded curated stone archetypes;
- large-form structural differences;
- weathering tied to environment rather than pure random noise.

### Risk: editor complexity

Mitigation:

- begin with path draw/edit;
- postpone automatic settlement walls;
- use explicit feature handles;
- expose advanced style parameters only in developer tooling.

## 11. Definition of done

The system is done for the first release when:

- a user can draw, save, reload, edit, damage, and delete a wall;
- the same save produces identical module and masonry hashes;
- no unrelated span changes after a local edit;
- corners and gates have no overlaps or unsupported gaps;
- walls remain grounded across streamed chunk boundaries;
- collision and navigation match breach state;
- LOD transitions do not change the wall silhouette materially;
- performance budgets pass in the infinite-world scene;
- legacy wall objects still render.
