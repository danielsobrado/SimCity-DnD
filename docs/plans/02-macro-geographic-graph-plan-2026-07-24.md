# Plan 02 — Macro geographic graph

Status: Proposed  
Priority: 2  
Depends on: Plan 01  
Blocks: Plans 5, 7, 8, and part of 9

## Goal

Build a deterministic campaign-scale graph that represents political hierarchy, settlement connectivity, routes, rivers, ports, borders, passes, and travel costs without depending on resident 3D terrain chunks.

The graph is the shared spatial authority for trade, migration, diplomacy, military movement, quest generation, news propagation, and fast travel estimates.

## Current foundation

The project already imports Azgaar states, provinces, burgs, routes, rivers, cells, vertices, feature identifiers, cultures, religions, and physical scale. The vector world map can display sharp political and geographic overlays and can move the player to a selected location.

The missing layer is a normalized topology suitable for deterministic simulation and pathfinding.

## Scope

Implement:

- Administrative containment graph.
- Settlement connection graph.
- Border adjacency graph.
- Road, river, sea, pass, and optional portal edges.
- Deterministic edge costs and capacities.
- Route segmentation for danger, ownership, and condition.
- Query APIs for reachability, nearest nodes, and pathfinding.
- Graph revisioning and selective invalidation.
- Validation and visualization hooks.

## Non-goals

- Local navmesh generation.
- Per-tile A* over rendered terrain.
- Tactical unit movement.
- Dynamic economy formulas.
- Detailed ship simulation.

## Graph layers

### Administrative graph

```text
World
└── State region
    └── Province region
        ├── Settlement
        ├── Resource site
        ├── Encounter site
        └── Wilderness region
```

This layer answers ownership and containment questions.

### Transport graph

Nodes:

- Settlements.
- Ports.
- River junctions.
- Road junctions.
- Mountain passes.
- Resource sites.
- Strategic sites.
- Optional portal anchors.

Edges:

- Road.
- Trail.
- Navigable river.
- Sea lane.
- Mountain pass.
- Ferry.
- Portal.

### Border graph

Tracks adjacency between states and provinces, including border length, crossing points, terrain difficulty, fortification, and access policy.

## Proposed structure

```text
src/sim/geography/
├── graphTypes.js
├── geographicGraph.js
├── graphBuilder.js
├── containmentIndex.js
├── spatialLookup.js
├── pathfinding/
│   ├── shortestPath.js
│   ├── routeCost.js
│   └── pathCache.js
├── revisions/
└── validation/
```

## Node contract

```js
{
  id,
  kind,
  canonicalPosition,
  regionId,
  settlementId,
  tags,
  enabled,
  revision
}
```

`canonicalPosition` uses stable global coordinates, not floating-origin render coordinates.

## Edge contract

```js
{
  id,
  kind,
  fromNodeId,
  toNodeId,
  distanceMeters,
  baseTravelHours,
  capacity,
  condition,
  danger,
  ownerFactionId,
  accessPolicy,
  seasonalFlags,
  revision
}
```

Edges are directional. A bidirectional route is represented by two directed traversal records or one edge with explicit direction support. Do not assume symmetric costs.

## Cost model

Keep pathfinding cost decomposition explicit:

```text
travelCost =
  baseTime
  × terrainModifier
  × conditionModifier
  × weatherModifier
  × congestionModifier
  × accessModifier
  + tollCost
  + expectedRiskCost
```

The first implementation should enable only base time, terrain, condition, danger, access, and toll. Weather and congestion remain configuration-controlled extensions.

## Graph construction

### Imported routes

- Preserve source route IDs.
- Convert route geometry into ordered segments.
- Snap route endpoints to settlements or generated junction nodes.
- Split edges at state/province borders, river crossings, and meaningful junctions.
- Preserve route kind and source metadata.

### Rivers

- Determine navigable segments from width, discharge, slope, or configured fallback rules.
- Build directional downstream edges.
- Add upstream edges with higher travel cost where navigation is allowed.
- Add port nodes for burgs close to navigable water.

### Sea connections

Start with conservative generated lanes between compatible ports:

- Same water feature or connected ocean feature.
- Maximum configured distance.
- No land intersection according to imported geometry.
- Deterministic candidate ordering.

Do not generate dense all-to-all port connections.

### Borders

- Derive state and province adjacency from Azgaar cell/vertex topology.
- Calculate stable crossing candidates near existing routes.
- Track closed, controlled, hostile, neutral, and allied policies separately from geometric adjacency.

## Configuration

```yaml
simulation:
  geography:
    graphVersion: 1
    roadSpeedKmPerHour: 5
    trailSpeedKmPerHour: 3
    riverDownstreamSpeedKmPerHour: 8
    riverUpstreamSpeedKmPerHour: 3
    seaSpeedKmPerHour: 12
    maxGeneratedSeaLaneKm: 400
    pathCacheEntries: 2048
    dangerWeight: 1.0
    tollWeight: 1.0
```

## Implementation phases

### Phase 0 — contracts and fixtures

- Define node and edge kinds.
- Add small hand-authored graph fixtures.
- Add deterministic pathfinding tests.
- Add unreachable and one-way route tests.
- Add graph serialization tests.

### Phase 1 — hierarchy and containment

- Project state and province containment.
- Associate settlements with province and state IDs.
- Add point-to-region lookup from imported geometry.
- Validate that every active settlement belongs to a valid region or explicit unclaimed area.

### Phase 2 — road and river graph

- Convert imported routes into graph edges.
- Build junctions and settlement endpoints.
- Build navigable river edges.
- Add route length and base travel time.
- Add source geometry references for map highlighting.

### Phase 3 — ports, sea lanes, and borders

- Generate port nodes.
- Generate bounded sea connections.
- Build border adjacency and crossing records.
- Add access policies and toll hooks.

### Phase 4 — runtime mutation

Support commands such as:

- `set_route_condition`
- `set_route_danger`
- `close_border_crossing`
- `open_border_crossing`
- `create_route`
- `destroy_route_segment`
- `change_route_owner`

Graph mutations increment edge and graph revisions and invalidate only affected path-cache entries.

### Phase 5 — map integration

- Highlight chosen routes.
- Display route type, condition, danger, capacity, and access.
- Add a path inspection mode with cost breakdown.
- Support click-to-inspect without starting travel.

## Acceptance gates

- The same imported map produces identical node and edge IDs.
- Every imported burg is represented by a settlement node.
- Every route edge references existing nodes and valid region ownership.
- Pathfinding produces deterministic results when costs tie.
- One closed border or destroyed bridge changes reachability without rebuilding the full graph.
- Graph queries do not require terrain chunks to be loaded.
- A three-burg vertical-slice route can be highlighted and explained on the world map.
- Route cost output includes a machine-readable component breakdown.

## Testing

Required suites:

- Golden graph projection from a small Azgaar fixture.
- Tie-breaking path determinism.
- Directional river travel.
- Closed-border routing.
- Split route at province boundary.
- Cache invalidation after one edge revision.
- Save/reload graph checksum.
- Large-map graph build memory and duration budget.

## Observability

Expose:

- Node count by kind.
- Edge count by kind.
- Connected components.
- Unreachable settlement count.
- Path queries, cache hits, and cache invalidations.
- Graph build duration.
- Largest node degree.
- Invalid edge count by reason.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Graph mirrors every Azgaar cell and becomes too large | Use strategic nodes and segments, not one simulation node per terrain cell |
| Sea lanes cut through land | Validate against imported feature geometry |
| Path ties change across runtimes | Stable node ordering and explicit tie-break keys |
| Local terrain disagrees with macro routes | Preserve canonical route geometry and project into local chunks when approached |
| Full rebuild after one change | Edge revisions and selective cache invalidation |

## Done definition

Plan 02 is complete when all settlements in an imported world belong to a validated political hierarchy, major transport routes form a deterministic graph, route costs are explainable, runtime closures affect pathfinding, and the graph operates without loading the 3D world.
