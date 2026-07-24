# Construction Domain and Save Format Plan

## 1. Objective

Define a stable authoritative model for path-based construction without storing generated meshes or individual stones.

The model must support:

- sparse infinite-world saves;
- deterministic regeneration;
- local edits;
- undo/redo;
- future simulation;
- schema migration;
- forward-compatible style versions.

## 2. Construction document

Recommended shape:

```yaml
id: construction_01J...
kind: wall
version: 1
style:
  key: castle_coursed_rubble
  version: 1
seed: 3489162401
path:
  closed: false
  points:
    - id: point_a
      x: 120.0
      z: 44.0
    - id: point_b
      x: 132.0
      z: 44.0
dimensions:
  height: 5.5
  thickness: 1.4
terrain:
  mode: stepped_foundation
  maxStepHeight: 0.75
  maxUnsupportedDepth: 3.0
top:
  type: crenellated
features:
  - id: gate_1
    type: gate
    distance: 8.0
    width: 3.0
    height: 3.5
state:
  buildProgress: 1.0
  health: 1.0
  breaches: []
metadata:
  factionId: null
  settlementId: null
```

Use JSON-compatible values in runtime and save formats even if examples are shown as YAML.

## 3. Coordinates

### Canonical authority

Store path points in canonical world X/Z coordinates.

Do not store floating-origin-adjusted scene positions.

### Height authority

Do not persist a Y coordinate for normal terrain-following wall path points.

Persist height overrides only when deliberately authored:

- bridge deck;
- elevated wall walk;
- tower floor;
- fixed gate threshold;
- explicit retaining-wall datum.

The normal wall base profile is derived from the canonical terrain field plus terrain policy.

### Precision

Use finite JavaScript numbers and validate bounds. Persist enough decimal precision for sub-cell placement without introducing arbitrary high-precision strings.

## 4. Stable IDs

Every mutable semantic element needs an ID:

- construction;
- path point;
- feature;
- breach;
- optional authored module override.

Generated courses and stones use derived IDs, not persisted IDs.

Example derivation:

```text
moduleId = hash(constructionId, segmentStartPointId, segmentEndPointId, moduleRole, localOrdinal)
```

A path point insertion should preserve IDs of unaffected segments when possible.

## 5. Style identity

A construction references:

- `style.key`;
- `style.version`.

The style version is part of deterministic generation.

Changing style content without incrementing the version is prohibited because old saves would silently change appearance and potentially collision.

Two supported update modes:

1. **Pinned**: old construction remains on its saved style version.
2. **Explicit upgrade**: migration command updates style version and records the change.

Initial implementation may keep old style definitions in the shipped YAML until a migration system exists.

## 6. Seed policy

Default seed:

```text
hash(worldSeed, constructionId, styleKey, styleVersion)
```

Persisting an explicit seed is still useful because:

- imported authored content can preserve its look;
- copied walls may choose same or new variation;
- tests can fixture exact layouts.

No stage may consume a shared sequential RNG whose call count changes when an unrelated feature is added.

Use stateless or forkable random streams:

```text
rng.for("module", moduleId)
rng.for("course", courseIndex)
rng.for("stone", stoneIndex)
```

## 7. Feature representation

Store features by normalized path distance or absolute canonical distance.

Prefer absolute distance from path start plus an anchor segment/point ID for edit stability.

```yaml
anchor:
  segmentStartPointId: point_a
  localDistance: 2.4
```

On path edits:

- preserve the same segment anchor if it still exists;
- clamp only when necessary;
- surface invalid features in the editor;
- never silently move a gate to an unrelated span.

## 8. Damage representation

Persist coarse semantic damage:

```yaml
breaches:
  - id: breach_1
    anchor:
      segmentStartPointId: point_b
      localDistance: 1.7
    width: 2.2
    baseHeight: 0
    remainingHeight: 0.6
    severity: 0.85
```

Derived data includes missing stones, cracks, exposed core, and debris.

Do not persist one health value per generated stone.

## 9. Build state

Allow staged construction later:

```yaml
buildProgress: 0.45
```

The first release may support only `0` and `1`, but the schema should not block:

- foundation-only;
- scaffold;
- partial courses;
- completed wall;
- repair state.

Build progress affects render output and simulation products through a deterministic stage mapping.

## 10. Chunk indexing

Maintain a secondary spatial index:

```text
chunkKey -> construction IDs touching expanded chunk bounds
```

Do not duplicate the construction document into every chunk.

Persistence options:

- one global sparse construction collection;
- chunk-to-ID index rebuilt at load;
- optional serialized index for faster startup.

A long construction may cross many chunks, but it remains one logical object.

## 11. Commands

Use explicit immutable commands:

- `construction_create`;
- `construction_delete`;
- `construction_insert_path_point`;
- `construction_move_path_point`;
- `construction_remove_path_point`;
- `construction_set_style`;
- `construction_set_dimensions`;
- `construction_add_feature`;
- `construction_update_feature`;
- `construction_remove_feature`;
- `construction_apply_damage`;
- `construction_repair_damage`.

Each command validates against current state and returns the dirty canonical bounds/path ranges.

## 12. Save integration

Add a new sparse collection to the current native world document version only through an intentional schema version increment.

Do not overload placed objects with a hidden custom payload.

Migration plan:

1. add optional `constructions` field;
2. old saves load with an empty collection;
3. keep legacy placed `wall` objects unchanged;
4. provide an optional editor conversion command for contiguous legacy walls;
5. increment native save version only if the existing loader requires strict shape changes.

## 13. Validation

Reject:

- duplicate IDs;
- unknown kinds;
- fewer than two points for open walls;
- fewer than three points for closed walls;
- zero-length segments;
- non-finite coordinates;
- unsupported style versions;
- invalid dimensions;
- overlapping feature intervals unless explicitly allowed;
- breaches outside path range;
- closed path self-intersections in the first release.

## 14. Tests

Required unit tests:

- encode/decode round trip;
- deterministic seed derivation;
- stable IDs after local path edits;
- feature anchor preservation;
- migration from save without constructions;
- invalid record rejection;
- chunk index coverage;
- style version pinning;
- damage serialization;
- copy-with-same-seed and copy-with-new-seed behavior.

## 15. Acceptance

- Save files do not contain generated vertex arrays or per-stone records.
- A loaded construction compiles to the same structural and masonry hashes.
- Editing one path point marks only the affected region and neighbors dirty.
- Floating-origin rebases do not mutate authoritative construction coordinates.
