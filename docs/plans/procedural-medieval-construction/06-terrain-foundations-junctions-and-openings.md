# Terrain, Foundations, Junctions, and Openings Plan

## 1. Objective

Make walls structurally coherent across terrain, corners, intersections, gates, towers, and height changes.

These constraints are solved before field masonry.

## 2. Terrain profile

Sample terrain along:

- centerline;
- left wall edge;
- right wall edge;
- feature thresholds;
- junction footprints.

Use canonical heightfield authority.

Sampling interval is bounded by:

- terrain cell size;
- style maximum step run;
- curvature/corner proximity;
- feature boundaries.

Do not sample every generated stone.

## 3. Foundation modes

### Conform

For low garden walls and irregular rural walls.

- wall base follows smoothed terrain;
- courses may step at bounded intervals;
- no per-stone tilt to terrain normal.

### Stepped foundation

Default for substantial medieval walls.

- choose horizontal foundation runs;
- insert vertical steps;
- align steps with module/course boundaries;
- cap maximum step height;
- avoid tiny alternating steps.

### Terraced

- request terrain flattening or use an existing terrace record;
- wall base remains level per terrace;
- terrain edit and construction command must be atomic or explicitly ordered.

### Retaining wall

- support different terrain levels on each side;
- expose deeper face on low side;
- compile a closed back/core;
- add gameplay metadata for drop/cover.

### Rock anchored

- terminate foundation against exposed rock/voxel authority;
- first release may use heightfield-only approximation;
- do not claim GPU voxel collision support until it exists.

### Bridged/span

Future mode for short gaps, aqueducts, and bridges.

Not part of first vertical slice.

## 4. Step solver

Input:

- sampled terrain profile;
- wall dimensions;
- max step height;
- min run length;
- max foundation depth;
- preferred course heights.

Objective:

- minimize excavation/foundation depth;
- minimize number of steps;
- align steps with courses;
- avoid step boundaries close to gates/corners;
- remain within style constraints.

A dynamic-programming or bounded optimization solver is preferable to greedy point-by-point following if greedy output chatters.

Initial implementation may use a deterministic greedy solver with a no-chatter rule, then upgrade if fixtures expose poor results.

## 5. Foundation geometry

Foundation components:

- footing;
- battered plinth;
- fill/core;
- exposed retaining face;
- optional drain/scupper detail.

Foundations should overlap terrain slightly to prevent visible gaps.

Do not stretch one box under an entire sloped path.

## 6. Corner ownership

A corner module owns the shared corner volume.

Adjacent spans provide sockets:

```text
span A -> corner socket A
span B -> corner socket B
corner module fills shared space
```

This prevents:

- overlapping wall bodies;
- double mortar;
- z-fighting;
- open seams;
- duplicated collision.

## 7. T-junction and cross-junction ownership

The junction module:

- determines which wall is primary;
- cuts or sockets secondary wall bodies;
- resolves top-walk continuity;
- produces shared collision;
- coordinates courses where visually important.

If two different styles meet, choose an explicit transition policy:

- dominant older wall;
- visible construction seam;
- tower/buttress mediator;
- invalid without override.

## 8. Gate feature

Gate planning reserves:

- opening width and height;
- jambs;
- lintel or arch;
- threshold;
- door/portcullis asset sockets;
- wall-walk bridge;
- navigation portal;
- defensive interaction points.

Gate body types:

- simple lintel;
- round arch;
- pointed arch;
- gatehouse connector.

First release: simple round arch or lintel, one leaf/pair asset, coarse open/closed state.

## 9. Door and window openings

Openings are semantic voids in structural regions.

Generate boundary dressings before field masonry.

Rules include:

- minimum side clearance;
- minimum vertical cover;
- no overlap with foundation steps;
- no intersection with crenel gaps unless designed;
- no opening across module chunk boundary unless boundary is reserved intentionally.

## 10. Arches

Arch geometry:

- opening profile;
- intrados and extrados;
- wedge-shaped voussoirs;
- keystone;
- optional archivolt ring;
- spandrel regions.

Collision uses a simplified arch or rectangular approximation depending on gameplay requirement.

Navigation uses the true portal clearance.

## 11. Towers

Towers are separate constructions or semantic modules with wall sockets.

Preferred long-term model:

```text
tower construction
  <- wall connection A
  <- wall connection B
  <- optional gatehouse
```

Do not embed an entire tower as a special stone cluster inside a wall span.

First release may support a tower connector placeholder module without full tower generation.

## 12. Wall walks and stairs

Structural top may include:

- parapet;
- wall walk;
- inner parapet;
- stairs/ramp connection;
- tower door.

Navigation generation must know walkable width, step heights, and guarded edges.

This is later than the first masonry slice but the structural schema should reserve top-walk dimensions now.

## 13. Crenellation corners and gates

Solve top rhythm after all feature intervals are known.

At corners:

- use a strong corner merlon;
- avoid narrow sliver merlons;
- choose one face as rhythm continuation or solve both into a corner cap.

Above gates:

- align central merlon/embrasure intentionally;
- support machicolation or hoarding only as later style modules.

## 14. Water and shore interactions

Initial policy:

- reject deep-water placement;
- allow shallow crossing only with explicit bridge/gate feature later;
- allow retaining/harbor wall style at shore if configured;
- prevent hidden foundation spikes to seabed.

## 15. Terrain edits after construction

Define authority:

- terrain edits trigger wall terrain-profile invalidation;
- wall recompiles foundation and affected masonry;
- hard failures produce diagnostic state, not silent floating walls;
- optionally block terrain edits under protected completed construction.

First release recommendation:

- allow terrain edits;
- mark construction invalid if limits are exceeded;
- keep last valid render plus warning until fixed or rebuilt.

## 16. Tests

- flat foundation;
- steady slope;
- noisy terrain no-chatter;
- step limit;
- deep foundation rejection;
- chunk-boundary terrain samples;
- inside/outside corners;
- T-junction;
- mixed-style seam;
- gate on flat and slope;
- arch module;
- terrain edit invalidation;
- retaining wall profile.

## 17. Acceptance

No daylight gaps, z-fighting, impossible sliver modules, or terrain-melted courses are visible at foundations, corners, gates, or chunk boundaries.
