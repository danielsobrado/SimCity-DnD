# Masonry and Stone Generation Plan

## 1. Objective

Generate believable stylized medieval masonry as deterministic constrained layouts inside structural regions.

The first masonry family is:

**coursed rubble with ashlar quoins, dressings, and a simplified rubble core.**

## 2. Historical/visual model

The visual model separates:

- foundation stones;
- wall-face stones;
- corner quoins;
- opening dressings;
- arch voussoirs;
- pinnings and small infill;
- mortar joints;
- internal rubble core;
- optional through/bond stones;
- coping or parapet stones.

The generator aims for plausibility and visual clarity, not archaeological reconstruction of one specific site.

## 3. Masonry region

Input:

```yaml
regionId: ...
role: outer_face
width: 7.2
height: 4.8
depth: 0.28
boundary:
  left: quoin_socket
  right: gate_dressing
  bottom: stepped_foundation
  top: parapet_socket
openings: []
```

Output:

- courses;
- stones;
- mortar field;
- boundary handshake records;
- generation statistics;
- deterministic hash.

## 4. Course solver

### Course height generation

1. calculate target course count from region height and style range;
2. generate bounded candidate heights;
3. normalize heights to exactly fill the region;
4. reserve larger foundation courses;
5. align courses with neighboring regions where required;
6. allow controlled broken-course transitions only through explicit rules.

Example style:

```yaml
masonry:
  family: coursed_rubble
  courseHeight: [0.22, 0.42]
  foundationCourseHeight: [0.35, 0.55]
  courseHeightVariation: 0.18
```

### Exact fill

Do not accumulate floating-point drift course by course.

Generate normalized boundaries:

```text
y0 = 0
yN = regionHeight
```

Derive each course height from adjacent boundaries.

## 5. Joint staggering

Vertical joints should not align across adjacent courses except at:

- region boundaries;
- opening dressings;
- deliberate stack-bond accents;
- damaged areas.

Maintain forbidden joint bands from the previous course.

When a candidate stone end falls inside a forbidden band:

- adjust width within style bounds;
- swap candidate archetype;
- redistribute residual interval;
- insert a pinning cluster;
- backtrack a bounded number of stones.

The solver must terminate. Use bounded retries and deterministic fallback partitioning.

## 6. Interval packing

Each course is a one-dimensional constrained packing problem.

Algorithm:

1. reserve left and right boundary stones;
2. divide remaining free intervals around openings;
3. estimate target stone count;
4. generate width candidates;
5. fit candidates to exact interval length;
6. enforce minimum residual gap;
7. avoid forbidden joints;
8. emit small infill only when normal stones cannot fit;
9. validate exact coverage tolerance.

Do not use unconstrained random widths followed by clipping.

## 7. Stone categories

### Field stone

Irregular rectangular/prismatic stone for wall faces.

### Ashlar

More regular cut stone for:

- quoins;
- gate jambs;
- arches;
- prestigious styles;
- wall caps.

### Pinning

Small stone filling a local residual gap. Use sparingly.

### Foundation stone

Larger, deeper, less vertically distorted.

### Bond stone

Longer stone with visual depth/side exposure. It need not physically traverse the full runtime wall if hidden.

## 8. Stone shape generation

Represent a stone as a low-resolution bevelled prism description:

```text
center
halfExtents
cornerOffsets
faceBulge
bevel
depth
orientation
attributes
```

Geometry rules:

- preserve shared mortar clearance;
- keep front face readable;
- vary corners in a controlled plane;
- avoid random vertex displacement that creates inverted faces;
- keep bottom/top surfaces compatible with course boundaries;
- use stronger irregularity for rubble than ashlar;
- reduce irregularity at structural dressings.

## 9. Two wall faces and core

Do not mirror the same stone layout to both faces.

Generate:

- outer face;
- inner face;
- simplified solid/rubble core.

Synchronize only structural constraints:

- course bands where needed;
- opening boundaries;
- corner sockets;
- top/foundation profile;
- bond-stone locations.

The core can be a low-poly closed volume at all normal LODs.

## 10. Corner quoins

For interlocked corners:

- alternate long/short stones per course;
- expose the long face on alternating wall faces;
- maintain consistent course boundary handshake;
- use lower irregularity;
- increase depth and scale slightly;
- provide sockets to field masonry regions.

Quoin stones are generated before field stones.

## 11. Openings

### Jambs and lintels

Reserve regular dressing stones first, then pack field masonry around them.

### Arches

Generate wedge-shaped voussoirs along an arc:

1. choose arch center/radius;
2. calculate wedge count from target stone width;
3. fit equal or gently varied angular spans;
4. generate keystone;
5. create arch ring thickness;
6. reserve spandrel regions;
7. pack surrounding masonry after the arch.

No runtime boolean subtraction is required because the opening is present in the region topology.

## 12. Mortar

Mortar is represented by the gaps between stones plus an optional recessed backing surface.

Parameters:

- joint width;
- recess depth;
- color;
- roughness;
- local erosion;
- limewash coverage.

Avoid separate mortar mesh strips per joint.

Preferred approaches:

- shared recessed region backing;
- vertex/material attributes around stone edges;
- medium/far LOD procedural joint field or baked atlas.

## 13. Stone attributes

Stable per-stone attributes:

- palette index or tint;
- roughness;
- grain scale;
- edge wear;
- dampness sensitivity;
- moss susceptibility;
- damage weakness;
- local AO strength;
- optional authored tag.

Store compact attributes in geometry buffers, not one material per stone.

## 14. Seed locality

Each course and stone has a deterministic key.

A gate added to one module must not change stone shapes in distant modules.

Boundary stones use IDs derived from the boundary, so both neighboring regions agree.

## 15. Budgets

Initial near-LOD targets per square meter of visible wall face:

- ordinary field stones: 5–12;
- ashlar style: 8–18;
- ruined detail: bounded separately;
- maximum vertices per render chunk: configurable hard cap;
- maximum generated stones per module: configurable hard cap.

When a region exceeds budget:

1. increase target stone size;
2. reduce bevel segments;
3. simplify rear face;
4. split render chunk;
5. never silently allocate without bound.

## 16. Worker suitability

The course and stone-description stages are pure data transforms and should be worker-compatible.

Avoid passing Three.js classes into workers.

Worker output:

- typed arrays or compact plain records;
- generation hash;
- bounds;
- statistics;
- error code.

Three.js `BufferGeometry` construction remains on the main thread unless a proven transferable path is introduced.

## 17. Debug output

Per region:

- course boundaries;
- forbidden joint bands;
- residual intervals;
- stone category colors;
- boundary sockets;
- failed candidate count;
- fallback count;
- final coverage error;
- layout hash.

## 18. Tests

- exact region coverage;
- no invalid overlap;
- minimum mortar gaps;
- joint staggering;
- bounded retry termination;
- same seed produces same hash;
- local style change affects only intended region;
- quoin alternation;
- arch fit;
- pinning rate ceiling;
- budget adaptation;
- worker serialization.

## 19. Acceptance

Near walls should read as constructed stonework, not noise-displaced boxes. Medium distance should preserve course rhythm and mortar depth even after individual stones are simplified.
