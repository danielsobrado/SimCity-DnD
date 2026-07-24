# Collision, Navigation, and Simulation Plan

## 1. Objective

Provide gameplay-authoritative collision and navigation derived from structural modules and damage state, not render triangles.

## 2. Collision hierarchy

### Broad phase

Per render/simulation chunk:

- AABB or capsule chain bounds;
- construction ID;
- module range.

### Narrow phase

Use simple primitives:

- oriented boxes for straight wall bodies;
- corner polygons/boxes;
- gate side boxes plus door collider;
- tower cylinders or convex approximations;
- stepped foundation boxes where necessary;
- breach residual boxes.

Do not generate one collider per stone.

## 3. Player collision

The current project grounds the player against CPU heightfield authority and does not yet use GPU voxel surfaces.

Construction collision should be CPU-queryable and independent of GPU readback.

Required queries:

- horizontal capsule sweep;
- overlap;
- ray/line-of-sight;
- step/ledge checks;
- optional wall-top grounding later.

Integration approach depends on current player controller architecture, but collision products must expose engine-neutral primitives first.

## 4. Collision compiler

Input:

- structural modules;
- foundation/top profiles;
- gate state;
- breach state;
- build progress.

Output:

```text
colliderId
constructionId
moduleId
shape
transform
bounds
layers
material/gameplay flags
revision
```

Collision compiler is deterministic and cheap compared with visual masonry.

## 5. Navigation blocking

Walls create navigation blockers based on:

- path thickness;
- gate portals;
- breach portals;
- construction progress;
- retaining drops;
- tower interiors if supported.

Initial implementation can expose a blocker/portal API even if a full navmesh system is not yet present.

## 6. Navigation representations

Potential phases:

### Phase A — local movement checks

Construction blockers participate in direct movement/collision only.

### Phase B — grid/cost overlay

Rasterize wall blockers and gate portals into simulation navigation cells.

### Phase C — navmesh/tiled navigation

Generate obstacle contours or tile rebuild requests around changed construction bounds.

Do not couple the construction save schema to one navigation implementation.

## 7. Gate state

Authoritative gate state:

- open;
- closed;
- locked;
- destroyed;
- under construction.

Derived products:

- collider enabled/disabled;
- navigation portal enabled/disabled;
- visual door transform;
- interaction prompt;
- defensive metadata.

Wall opening collision remains while door collision changes.

## 8. Breaches

When breach state becomes passable:

- collision updates immediately;
- navigation portal/blocker updates immediately;
- detailed render rebuild follows asynchronously.

Passable width and height use explicit thresholds from gameplay config.

## 9. Wall tops

Future walkable wall-top support requires:

- walk surface profile;
- parapet collision;
- stair/ramp portals;
- tower connections;
- edge fall protection;
- navigation links.

Reserve semantic data in structural modules now, but do not delay the first ground-level wall slice.

## 10. Projectiles and line of sight

Expose coarse material thickness and resistance:

- ray intersects module volume;
- determine wall material/style;
- apply gate/breach special case;
- optionally sample remaining height profile.

Do not raycast every stone for gameplay authority.

Near visual raycasts may still be used for decals/effects if results do not determine core simulation.

## 11. Cover

Compute cover metadata from:

- wall height;
- local remaining height;
- side orientation;
- opening;
- crenellation/embrasure;
- distance from wall.

This supports future tactical simulation without analyzing geometry.

## 12. Construction simulation

Potential semantic state:

- resource cost;
- labor required;
- build progress;
- maintenance;
- decay;
- ownership;
- defensive value;
- repair priority.

Keep these in simulation/domain services, not render classes.

## 13. Spatial index

Maintain a construction collision index by canonical chunk/bounds.

Queries convert scene positions to canonical coordinates when necessary.

Floating-origin rebase changes view transforms, not collider authority.

## 14. Update ordering

For an accepted edit or damage event:

1. validate domain command;
2. update construction state;
3. rebuild coarse collision/navigation;
4. publish simulation revision;
5. schedule detailed rendering;
6. atomically swap visuals.

Never leave old collision active after a visible passable breach is committed.

## 15. Debug tools

- collider wireframes;
- broad-phase bounds;
- navigation blockers;
- gate/breach portals;
- cover sample points;
- revision labels;
- query trace overlay.

## 16. Tests

- straight wall blocks movement;
- wall endpoint behavior;
- corner no-leak;
- gate open/closed;
- breach threshold;
- damage update ordering;
- floating-origin invariance;
- chunk-boundary query;
- construction delete;
- partial-build collision;
- retaining wall side behavior;
- no collider-per-stone growth.

## 17. Acceptance

Gameplay collision, navigation state, and visible openings agree during placement, save/load, editing, gate transitions, damage, and repair.
