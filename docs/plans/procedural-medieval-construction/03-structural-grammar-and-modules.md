# Structural Grammar and Module Planning

## 1. Objective

Convert a canonical wall path and style into a stable hierarchy of meaningful medieval structural modules before generating masonry.

This is the main improvement over a repeated spline-section system.

## 2. Why a grammar

A repeated module loop can place boxes along a path, but it cannot reliably answer:

- where corners begin and end;
- how gates reserve wall space;
- how crenellations align;
- where buttresses fit;
- how towers connect;
- how wall heights transition;
- where terrain steps should occur;
- how openings affect surrounding masonry.

A small context-sensitive shape grammar provides control without implementing a general-purpose grammar language.

## 3. Grammar layers

```text
Construction
  -> PathRegion*
PathRegion
  -> StraightSpan | Corner | Junction | FeatureRegion
StraightSpan
  -> Foundation + Body + Top + OptionalSupports
FeatureRegion
  -> Gate | Door | Stair | TowerConnector | Breach
Body
  -> MasonryRegion*
Top
  -> Coping | Parapet | CrenellatedParapet | RuinedTop
```

Each production returns semantic geometry constraints, not Three.js meshes.

## 4. Planner input

- construction ID and seed;
- ordered canonical path;
- dimensions;
- terrain profile;
- style definition/version;
- explicit features;
- neighboring construction connections;
- damage state;
- build progress.

## 5. Planner output

```yaml
modules:
  - id: module_...
    kind: straight_span
    pathInterval: [0.0, 7.25]
    frame:
      origin: [x, y, z]
      tangent: [x, y, z]
      outward: [x, y, z]
    dimensions:
      heightStart: 5.5
      heightEnd: 5.5
      thickness: 1.4
    regions:
      - role: outer_face
      - role: inner_face
      - role: rubble_core
      - role: parapet
```

The output must be serializable for debugging but is not persisted in the world save.

## 6. Path preprocessing

1. remove duplicate adjacent points;
2. reject zero-length segments;
3. calculate cumulative distance;
4. calculate horizontal tangent and outward vectors;
5. classify corners by signed angle;
6. merge nearly collinear short segments;
7. reserve junction neighborhoods;
8. sample terrain;
9. reserve explicit feature intervals.

Preprocessing must preserve authored point IDs.

## 7. Stable module boundaries

Module boundaries come from:

- path endpoints;
- corners;
- junction extents;
- feature extents;
- foundation steps;
- height transitions;
- style maximum span length;
- render chunk boundaries;
- damage boundaries.

Do not let stone width choices determine structural module boundaries.

Stable boundaries reduce visual reshuffling after edits.

## 8. Corner types

### Mitered corner

Suitable for regular ashlar or clean stylized castle walls.

### Interlocked quoin corner

Alternating long corner stones overlap each face.

Preferred default for coursed rubble.

### Rounded tower connector

Ends both spans against a tower socket.

### Ruined broken corner

Allows exposed core and asymmetric collapse.

Corner classification uses angle and style policy.

## 9. Junction types

- continuation;
- endpoint corner;
- T-junction;
- cross-junction;
- tower hub;
- gatehouse hub.

A junction solver owns the shared volume. Adjacent wall spans terminate at sockets supplied by the junction module.

This prevents duplicate overlapping corner geometry.

## 10. Buttress planning

Buttresses are structural/decorative modules placed after gates and corners reserve space.

Policy inputs:

- minimum/maximum spacing;
- slope;
- wall height;
- style;
- nearby feature clearance;
- seed.

Algorithm:

1. calculate free intervals;
2. choose target spacing within style range;
3. distribute count evenly;
4. apply bounded seeded jitter;
5. shift away from invalid zones;
6. omit instead of forcing overlaps.

## 11. Top rhythm

Crenellations need a whole-span rhythm solver.

For each free top interval:

1. compute target merlon and crenel widths;
2. choose integer repeat count;
3. solve adjusted repeat width to fit exactly;
4. place stronger end merlons;
5. align rhythm across visually continuous spans when possible;
6. terminate cleanly at gates and towers.

Never place two hard-coded crenels per generic segment.

## 12. Height transitions

Height changes use explicit modules:

- vertical step;
- sloped coping;
- stair-stepped parapet;
- tower transition.

For coursed stone, prefer discrete height steps aligned with masonry courses.

## 13. Foundation grammar

Foundation forms:

- level footing;
- stepped footing;
- battered plinth;
- retaining base;
- rock-anchored base;
- bridge pier transition.

The structural planner consumes the terrain profile and emits foundation regions before wall-body regions.

## 14. Style schema

```yaml
structure:
  wall:
    minHeight: 1.5
    maxHeight: 12
    minThickness: 0.5
    maxThickness: 3
  corners:
    type: interlocked_quoins
    reserveLength: 1.2
  buttresses:
    enabled: true
    spacing: [7, 11]
    width: [0.7, 1.0]
    projection: [0.35, 0.7]
  top:
    allowed: [coping, crenellated]
    merlonWidth: [0.7, 1.1]
    crenelWidth: [0.55, 0.9]
```

Loader validation converts raw YAML into normalized immutable runtime definitions.

## 15. Deterministic rule selection

Rule choices use named forks:

```text
rng("corner-style", cornerId)
rng("buttress-layout", spanId)
rng("top-rhythm", topIntervalId)
```

Selection must not depend on iteration order of maps or resident chunks.

## 16. Error handling

Planner errors include:

- feature cannot fit;
- junction socket conflict;
- impossible top rhythm;
- unsupported self-intersection;
- foundation exceeds limits;
- module below minimum length.

Production behavior:

- validation prevents commit when possible;
- loaded invalid records render a safe diagnostic shell;
- log one structured error per construction revision;
- never produce NaN transforms.

## 17. Debug tools

Add overlays for:

- path intervals;
- module IDs;
- local frames;
- feature reservations;
- junction sockets;
- buttress candidates;
- top rhythm;
- dirty ranges.

Add a JSON dump of planner input and output for deterministic regression fixtures.

## 18. Tests

- straight span decomposition;
- L corner;
- acute and obtuse corners;
- T and cross junction;
- gate reservation;
- buttress interval packing;
- exact crenellation fit;
- height transition;
- terrain step boundary;
- local edit preserving unaffected module IDs;
- invalid grammar fallback.

## 19. Acceptance

A wall's structural plan must look correct before any individual stone is generated. The debug shell alone should already show believable medieval construction proportions and valid junctions.
