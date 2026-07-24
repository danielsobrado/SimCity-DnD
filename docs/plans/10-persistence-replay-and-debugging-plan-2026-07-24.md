# Plan 10 — Persistence, replay, and debugging

Status: Proposed  
Priority: 10  
Depends on: Plan 01 foundations and the schemas from Plans 2–9  
Blocks: reliable campaign saves, deterministic QA, and long-term development

## Goal

Make the evolving world safe to save, migrate, inspect, replay, verify, and recover.

Persistence is not only file output. It is the contract that proves the same imported world, configuration, and command history can reproduce the same authoritative state while surviving version changes and partial failures.

## Current foundation

The project already uses version 6 world documents, IndexedDB browser saves, sparse terrain overrides, dense binary encoding for heavily modified chunks, imported campaign metadata, macro-atlas persistence, placed objects, and voxel stamps.

The simulation layer now needs snapshots, command and event journals, schema migrations, checksums, corruption detection, local-state persistence, and developer inspection tools.

## Scope

Implement:

- Versioned simulation snapshot format.
- Command journal.
- Important domain-event history.
- Deterministic serialization order.
- State checksums.
- Save transactions and recovery.
- IndexedDB storage layout.
- Snapshot compaction and retention.
- Schema and projection migrations.
- Replay runner and checksum verification.
- Local encounter and Tier C persistence.
- Debug inspectors, decision traces, and exportable QA reports.

## Non-goals

- Cloud save service.
- Multiplayer rollback networking.
- Infinite retention of every low-value event.
- Database technology migration before browser constraints require it.
- Using replay as a substitute for clear state schemas.

## Persistence layers

```text
WorldDefinition
  immutable imported geography and authored source data

WorldSnapshot
  complete authoritative simulation state at one tick

CommandJournal
  accepted player and system commands after the snapshot

EventHistory
  important historical events and optional recent reducer events

LocalState
  resumable local encounters, interiors, and instantiated bindings

RenderPersistence
  existing terrain edits, objects, and voxel stamps
```

The save manifest references each layer by version and checksum.

## Save manifest

```js
{
  documentVersion,
  simulationSchemaVersion,
  projectionVersion,
  worldId,
  sourceFingerprint,
  configurationFingerprint,
  snapshotTick,
  worldRevision,
  snapshotChecksum,
  commandRange,
  eventRange,
  localStateIndex,
  createdAt,
  applicationVersion
}
```

`createdAt` is metadata only and does not affect simulation checksums.

## Deterministic serialization

Rules:

- Entity maps serialize as arrays sorted by stable ID.
- Object keys use canonical ordering where checksums are calculated.
- Fixed-point integers remain integers.
- Undefined fields are rejected or normalized before persistence.
- Floating-point values that belong to authoritative state must define quantization.
- Sets and maps never serialize in runtime iteration order.
- Compression happens after canonical serialization.

Create one canonical serializer used by save, replay, checksum, and deterministic tests.

## Snapshot strategy

Use periodic full snapshots plus journals.

Suggested policy:

```yaml
simulation:
  persistence:
    snapshotIntervalDays: 30
    maximumSnapshots: 12
    maximumCommandsBetweenSnapshots: 100000
    importantEventRetentionYears: 20
    recentReducerEventDays: 30
    compression: gzip
    strictChecksum: true
```

Snapshot creation must be resumable or performed from an immutable state view so it does not block simulation for an unbounded frame.

## Command journal

Store accepted commands in canonical order with:

- Command ID.
- Type.
- Tick.
- Actor.
- Expected revision.
- Payload.
- Source.
- Result status.

Rejected commands may be retained in development diagnostics but do not belong in authoritative replay unless explicitly required.

System-generated commands must be deterministic and replayable. Do not journal presentation-only actions such as opening the map.

## Event history

Separate two concerns:

### Reducer events

Detailed events needed to rebuild state between snapshots. These may be compacted after a newer verified snapshot.

### Historical events

Curated events used for world history, rumours, faction memory, recaps, and UI. Examples:

- War declared.
- Settlement captured.
- Major battle.
- Famine.
- Leader death.
- Trade route reopened.
- Player contract completed.

Historical events remain queryable even after reducer-event compaction.

## Save transaction

Browser save flow:

1. Build canonical snapshot or incremental journal batch.
2. Calculate checksums.
3. Write new records under a temporary transaction ID.
4. Verify stored bytes and checksums.
5. Atomically update the active save manifest pointer.
6. Retain the prior valid manifest until the new one is committed.
7. Remove abandoned temporary records later.

A crash during save must leave at least one valid manifest.

## IndexedDB layout

Proposed stores:

- `worldManifests`
- `worldDefinitions`
- `simulationSnapshots`
- `commandJournals`
- `eventHistories`
- `localStates`
- `renderOverrides`
- `contentCache`

Keys should begin with `worldId` and include schema or sequence identifiers where useful. Large records should be chunked only when browser limits or measured write stalls require it.

## Migration model

Each migration declares:

- Source version.
- Target version.
- Supported preconditions.
- Deterministic transform.
- Validation after transform.
- Whether replay journals also require migration.
- Rollback or failure behaviour.

Never silently reinterpret old fields. If a migration cannot preserve meaning, fail with a clear compatibility message and retain the original save.

Migration fixtures must include real prior versions once production saves exist.

## Replay runner

Provide a headless replay API and CLI script:

```text
load WorldDefinition
→ load verified snapshot
→ apply canonical commands/events
→ advance scheduler
→ calculate checkpoints
→ compare expected checksums
→ output divergence report
```

Recommended scripts:

```text
npm run sim:replay -- <save-or-fixture>
npm run sim:verify -- <fixture>
npm run sim:soak -- <scenario>
```

Exact names are proposed.

## Checkpoints and divergence

Record optional checkpoint checksums by:

- Tick.
- Subsystem.
- Entity kind.
- Selected entity IDs.

On mismatch, report the earliest divergent checkpoint and structured state differences. Avoid dumping the entire world when one inventory account changed.

## Debugging interfaces

### World inspector

Inspect any canonical entity by ID:

- Current state.
- Revision.
- References.
- Recent commands and events.
- Tier representation.
- Validation issues.

### Decision inspector

Show faction, economy, migration, route, and contract reasons with weighted contributions.

### Timeline

Filter important events by region, settlement, faction, entity, and type.

### Determinism report

Export JSON containing:

- Source and configuration fingerprints.
- Tick range.
- Final checksums.
- Per-system durations.
- Entity counts.
- Conservation residuals.
- Divergence information.

## Local-state persistence

Persist only local state that cannot be reconstructed safely:

- Active encounter bindings.
- Persistent NPC health and identity.
- Cleared or altered encounter sites.
- Local cargo state during Tier C promotion.
- Open containers or objective objects with canonical relevance.
- Interior state when authored persistence requires it.

Do not save disposable vegetation, terrain meshes, or reconstructible procedural decoration.

## Implementation phases

### Phase 0 — foundational contracts

Begin during Plan 01:

- Schema versions.
- Canonical serializer.
- Stable IDs.
- World and configuration fingerprints.
- State checksum helpers.

### Phase 1 — snapshot persistence

- Save and load normalized world state.
- Verify checksum before activation.
- Keep prior valid save.
- Add transactional IndexedDB writes.

### Phase 2 — journals and replay

- Record accepted commands.
- Replay from snapshot.
- Add checkpoint checksums.
- Add first vertical-slice replay fixture.

### Phase 3 — local state and tier transitions

- Persist active contracts, shipments, encounters, and Tier C bindings.
- Test save during local encounter.
- Resume and demote without duplication.

### Phase 4 — migrations and compaction

- Add migration registry.
- Add snapshot rotation.
- Compact reducer events after verified snapshot.
- Retain important historical events.

### Phase 5 — developer tooling

- Add entity inspector.
- Add decision trace views.
- Add replay and soak scripts.
- Add divergence report export.

## Acceptance gates

- Save and reload produce the same authoritative checksum.
- The vertical slice replays from a fixture to the same final checksum.
- A simulated crash during save leaves the prior manifest loadable.
- Corrupted snapshot bytes are detected before world activation.
- Active shipment and local encounter state survive reload without duplicated cargo or NPCs.
- A schema migration is deterministic and validated.
- Snapshot compaction does not remove required historical events.
- The earliest replay divergence can be localized by subsystem or entity.
- Existing terrain and Azgaar version 6 data remain preserved through the new manifest.

## Testing

Required suites:

- Canonical serialization ordering.
- Snapshot checksum verification.
- Interrupted save recovery.
- Journal replay.
- Duplicate command idempotence.
- Migration fixtures.
- Local encounter save/reload.
- Snapshot compaction.
- Corruption detection.
- Earliest-divergence reporting.
- Multi-year save-size and memory soak.

## Observability

Expose:

- Save duration and bytes by layer.
- Snapshot and journal sizes.
- Current schema and projection versions.
- Last verified checksum.
- Replay commands per second.
- Snapshot interval and compaction count.
- Recovery from prior manifest count.
- Migration duration and failures.
- Divergence checkpoint.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Save format mirrors unstable runtime objects | Canonical normalized serializer |
| Journals grow without bound | Periodic verified snapshots and compaction |
| Migration destroys old saves | Transactional migration and original retention |
| Replay mismatch is impossible to diagnose | Subsystem and entity checkpoints |
| Local state duplicates macro state | Canonical bindings and reconciliation checks |

## Done definition

Plan 10 is complete when campaign state can be saved transactionally, reloaded, migrated, replayed, checksummed, inspected, and recovered after interruption; and the full vertical slice can prove deterministic outcomes through an automated replay fixture.
