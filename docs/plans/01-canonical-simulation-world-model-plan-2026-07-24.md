# Plan 01 — Canonical simulation world model

Status: Proposed  
Priority: 1  
Depends on: existing Azgaar import and version 6 world document  
Blocks: Plans 2–11

## Goal

Create one authoritative, normalized, deterministic simulation model that is independent from rendering residency and independent from the raw Azgaar document.

Azgaar remains the source for initial geography, political divisions, burgs, routes, rivers, cultures, religions, biomes, and names. Runtime simulation state must live in separate entities that may change, split, merge, move, be destroyed, or be created by the player.

## Current foundation

The project already preserves imported states, provinces, cultures, religions, burgs, routes, rivers, markers, zones, notes, feature identifiers, and compact Azgaar cell/vertex geometry. Version 6 saves also store terrain overrides, placed objects, campaign metadata, voxel stamps, and the compressed macro atlas.

The missing layer is a canonical simulation database with explicit identity, ownership, revision, validation, and serialization rules.

## Scope

Implement:

- Stable IDs for imported and generated entities.
- Immutable world-definition records.
- Mutable normalized world-state records.
- Commands and domain events.
- Entity revisions and world revision.
- Referential-integrity validation.
- Deterministic import projection from Azgaar metadata.
- Query interfaces that do not expose mutable internal maps.
- Schema versioning hooks required by persistence and replay.

## Non-goals

- Economy formulas.
- Pathfinding.
- Detailed NPC AI.
- Rendering ownership.
- LLM-driven canonical state changes.
- Per-citizen global entities.

## Proposed structure

```text
src/sim/
├── model/
│   ├── ids.js
│   ├── entityKinds.js
│   ├── worldDefinition.js
│   ├── worldState.js
│   ├── entities/
│   └── validation/
├── commands/
│   ├── commandEnvelope.js
│   ├── commandRegistry.js
│   └── handlers/
├── events/
│   ├── domainEvent.js
│   ├── eventRegistry.js
│   └── reducers/
├── import/
│   ├── projectAzgaarWorld.js
│   └── projectionVersion.js
└── queries/
    ├── worldQueries.js
    └── entityQueries.js
```

All paths are proposed. Keep modules small and split by entity or responsibility.

## World layers

### Immutable `WorldDefinition`

Contains imported or authored facts that are not mutated by ordinary simulation ticks:

- World ID, source map fingerprint, seed, generator version, and physical scale.
- Original Azgaar cell, vertex, state, province, culture, religion, burg, route, and river identifiers.
- Biome definitions and source colors.
- Canonical geographic coordinates and initial political ownership.
- Import projection version.

Changes to definition data require an explicit migration or re-import operation.

### Mutable `WorldState`

Contains normalized maps keyed by stable IDs:

```text
WorldState
├── calendar
├── settlements
├── regions
├── factions
├── markets
├── populations
├── resourceSites
├── routes
├── shipments
├── parties
├── encounters
├── conflicts
├── contracts
├── worldEvents
└── revisions
```

Do not nest full mutable entities inside each other. Store references by ID.

## Initial entity catalogue

Minimum canonical entities:

| Entity | Purpose |
|---|---|
| `Region` | State, province, wilderness, and administrative ownership |
| `Settlement` | Persistent burg or player-founded settlement |
| `PopulationCohort` | Aggregated demographic/labour group |
| `Market` | Settlement inventories, orders, and prices |
| `ResourceSite` | Farm region, mine, forest, quarry, magical site |
| `Route` | Road, river, sea lane, pass, or portal connection |
| `Faction` | State, house, guild, religion, order, tribe, criminal group |
| `Shipment` | Goods moving between locations |
| `Party` | Adventurers, army company, caravan escort, monster group |
| `EncounterSite` | Persistent local problem or opportunity |
| `Conflict` | War, rebellion, feud, embargo, religious dispute |
| `Contract` | Structured RPG task linked to world needs |
| `WorldEvent` | Important historical event suitable for UI and replay |

## Stable ID contract

Imported entities use source-derived IDs:

```text
region:azgaar-state:<sourceId>
region:azgaar-province:<sourceId>
settlement:azgaar-burg:<sourceId>
culture:azgaar:<sourceId>
religion:azgaar:<sourceId>
route:azgaar:<sourceId>
river:azgaar:<sourceId>
```

Generated entities use deterministic command-derived IDs:

```text
<kind>:generated:<worldId>:<commandId>:<ordinal>
```

A command ID is deterministic within a replay. Never use timestamps, random UUIDs, array order from an unordered source, or object memory identity.

## Entity envelope

Every mutable entity must contain:

```js
{
  id,
  kind,
  revision,
  createdAtTick,
  updatedAtTick,
  status,
  tags,
  data
}
```

`status` should support at least `active`, `inactive`, `destroyed`, and `archived`. Destruction should not silently delete historically referenced entities.

## Command and event flow

```text
Input intent
→ validated command envelope
→ command handler
→ domain events
→ deterministic reducers
→ new world revision
→ optional presentation notifications
```

Command envelope fields:

- `id`
- `type`
- `issuedAtTick`
- `actorId`
- `expectedWorldRevision`
- `payload`
- `source`

Domain event fields:

- `id`
- `type`
- `tick`
- `causedByCommandId`
- `entityIds`
- `payload`
- `schemaVersion`

Handlers validate intent and emit events. Reducers apply state changes. UI code must not mutate state directly.

## Configuration

Add a dedicated YAML section or file:

```yaml
simulation:
  schemaVersion: 1
  projectionVersion: 1
  strictValidation: true
  retainDestroyedEntities: true
  maxEventsPerTick: 10000
```

Do not place entity rules in renderer configuration objects.

## Implementation phases

### Phase 0 — contracts and tests

- Define entity kinds and ID grammar.
- Add deterministic ID tests.
- Add normalized state shape tests.
- Add rejection tests for duplicate IDs and broken references.
- Define command/event JSON schemas or equivalent runtime validators.

### Phase 1 — Azgaar projection

- Fingerprint the imported source data.
- Project states and provinces into `Region` entities.
- Project burgs into `Settlement` entities.
- Project cultures and religions as immutable definition records.
- Preserve source IDs and initial ownership.
- Sort all source collections by canonical source ID before projection.

### Phase 2 — authoritative store

- Implement read-only query views.
- Implement command dispatch and event reduction.
- Track world and entity revisions.
- Reject stale commands using `expectedWorldRevision` where required.
- Add transaction semantics: all events for one command apply or none apply.

### Phase 3 — integration boundary

- Expose settlement and region lookup to the world map.
- Keep existing campaign metadata available during migration.
- Add an adapter so local chunk content can reference canonical entity IDs.
- Prevent renderer code from owning authoritative simulation objects.

### Phase 4 — hardening

- Add full-world referential validation.
- Add deterministic serialization ordering.
- Add checksum generation over canonical state.
- Add migration fixtures for schema version changes.
- Add malformed import and partial-data tests.

## Acceptance gates

- Re-importing the same Azgaar source with the same configuration produces byte-equivalent normalized initial state.
- Entity IDs remain stable across save/reload.
- No authoritative cross-reference uses a direct JavaScript object reference.
- A failed command leaves the world state unchanged.
- Commands replay to the same state checksum.
- Destroyed entities remain resolvable for historical events.
- Terrain chunk eviction does not remove or mutate simulation entities.
- Existing imported maps continue to load through an explicit migration path or clear compatibility error.

## Observability

Expose development counters:

- Entity count by kind.
- Active/destroyed count.
- Commands accepted/rejected.
- Events emitted/applied.
- Validation failures by code.
- World revision.
- State checksum.
- Import projection duration.

Validation errors must include stable reason codes such as `duplicate_entity_id`, `missing_reference`, `invalid_entity_kind`, and `stale_world_revision`.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Raw Azgaar objects leak into runtime state | Projection boundary and normalized records |
| IDs change after import code refactor | Versioned ID grammar and golden fixtures |
| UI mutates simulation maps | Read-only query APIs and command-only writes |
| Save size grows through historical records | Snapshot compaction in Plan 10 while retaining important events |
| One giant state module becomes unmaintainable | Entity-specific modules and registries |

## Done definition

Plan 01 is complete when one imported world can be projected into a validated canonical state, modified only through commands/events, serialized deterministically, reloaded with stable IDs, and checked against a repeatable checksum.
