# Editor Wall-Path Placement Plan

## 1. Objective

Add a construction-specific editor workflow for drawing and editing wall paths across the infinite terrain.

The tool must feel direct in both orbit and first-person-compatible editor contexts while preserving canonical coordinates and deterministic commands.

## 2. Tool modes

Initial modes:

- **Draw wall**: click points, double-click or Enter to finish.
- **Edit path**: move, insert, and remove control points.
- **Add feature**: place gate, buttress override, stairs, or tower connector.
- **Select construction**: select the whole wall or a semantic span.
- **Delete construction**.
- **Style inspector**: change style and dimensions.

Do not expose individual generated stones as selectable editor entities.

## 3. Draw workflow

1. User selects a wall style.
2. First click establishes the start point.
3. Pointer movement displays a live span preview.
4. Further clicks append control points.
5. Enter or double-click commits the path.
6. Escape cancels the active draw operation.
7. Backspace removes the last uncommitted point.

Preview must show:

- centerline;
- wall width;
- top silhouette;
- foundation warnings;
- invalid intersections;
- gate/tower reserved intervals;
- estimated cost class.

## 4. Canonical picking

Use the existing terrain picking path to obtain scene-space positions, then convert through floating origin into canonical coordinates before:

- snapping;
- validation;
- command creation;
- save storage.

All UI handles render in scene coordinates derived from canonical state each frame or rebase.

## 5. Snapping

Supported snapping priorities:

1. construction endpoint;
2. construction path segment;
3. grid;
4. terrain hit;
5. optional angle increment.

Configuration:

```yaml
construction:
  editor:
    endpointSnapMeters: 1.0
    segmentSnapMeters: 0.6
    gridSnapMeters: 0.25
    angleSnapDegrees: 15
    minimumSegmentLength: 0.5
```

Modifier policy:

- Shift: temporary angle snap;
- Alt: disable snapping;
- Ctrl/Cmd: force grid snap;
- Tab: cycle candidate snap targets when ambiguous.

Keep bindings centralized in config or constants.

## 6. Path representation in the editor

Use polylines for authoritative wall paths in the first release.

Do not use `CatmullRomCurve3` as authority because:

- spline edits can move the entire wall unexpectedly;
- historical defensive walls are often piecewise straight;
- collision and module boundaries are easier to reason about;
- deterministic feature anchoring is more stable.

A future curved-wall type can approximate arcs with explicit sampled points and retain those points as authority.

## 7. Preview levels

### Lightweight live preview

During pointer motion:

- use low-poly shell geometry;
- no per-stone generation;
- no expensive material;
- sample terrain at bounded intervals;
- show semantic modules.

### Debounced detailed preview

After pointer rests or a point is placed:

- generate coarse masonry;
- show actual steps and crenellations;
- perform full feature validation.

### Committed construction

After command acceptance:

- schedule production compilation;
- retain preview shell until render chunks are ready;
- atomically replace preview output.

## 8. Terrain validation

Live validation checks:

- maximum local grade;
- maximum foundation depth;
- water crossing;
- unsupported gap;
- intersection with protected objects;
- minimum gate clearance;
- self-intersection;
- too-short span;
- path outside imported-world policy if such a policy exists.

Warnings and hard failures are separate.

Examples:

- steep terrain with stepped foundation: warning;
- foundation deeper than style maximum: failure;
- crossing a road: warning or feature suggestion;
- self-intersection: failure in v1.

## 9. Path editing

Handles:

- point handle;
- segment midpoint insertion handle;
- feature handle;
- elevation override handle where supported.

Path edit transaction:

1. begin drag;
2. compute canonical candidate;
3. run lightweight validation;
4. update visual preview only;
5. commit one command on pointer release;
6. restore original state on cancel.

Do not write a command per pointer-move event.

## 10. Junction editing

When an endpoint snaps to another construction:

- display intended junction type;
- allow cycling butt, miter, T, cross, or tower connector where valid;
- save endpoint connection metadata;
- dirty both constructions;
- ensure deletion of one construction leaves the other valid.

The first release can auto-select:

- collinear endpoint: continuation;
- endpoint to segment: T-junction;
- endpoint to endpoint with angle: corner.

## 11. Feature placement

Feature placement uses distance along the path.

The editor displays:

- feature footprint interval;
- opening height;
- required side clearance;
- collision portal;
- terrain threshold;
- conflicts with nearby corners and features.

Moving a feature does not rewrite the path.

## 12. Selection and picking

Construction picking should not depend on thousands of near-LOD stone triangles.

Use dedicated invisible or simplified pick geometry:

- expanded path capsules;
- module bounding boxes;
- gate/tower semantic volumes.

Return:

```text
constructionId
moduleId
featureId?
pathDistance
hitSide
```

## 13. UI integration

Add a Construction category next to terrain, objects, and voxel tools.

Initial controls:

- style;
- height;
- thickness;
- top type;
- terrain mode;
- draw/edit/feature action;
- seed reroll;
- regenerate;
- convert legacy walls.

Advanced generator values remain in YAML and developer panels initially.

## 14. Undo and redo

Every completed user action maps to one reversible command.

Required operations:

- create;
- append point;
- insert point;
- move point;
- delete point;
- add feature;
- move feature;
- change style;
- change dimensions;
- delete construction.

Generated geometry updates are side effects and do not enter command history.

## 15. Performance requirements

- pointer preview target: under 1 ms CPU p95;
- no detailed masonry generation per pointer event;
- no full scene refresh after one wall edit;
- no synchronous compilation of distant chunks;
- no renderer readbacks;
- one dirty update event per committed edit.

## 16. Acceptance scenarios

1. Draw a 30 m straight wall.
2. Draw an L-shaped wall.
3. Snap a new wall into a T-junction.
4. Move the middle point of a three-span wall.
5. Add and move a gate.
6. Cross a terrain chunk boundary.
7. Rebase floating origin while wall is selected.
8. Save and reload with selection cleared.
9. Undo and redo each edit.
10. Cancel an invalid edit without modifying state.
