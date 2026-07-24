# Azgaar world economy and RPG simulator roadmap

Status: Proposed  
Date: 2026-07-24  
Scope: `Simulator-Test`

## Purpose

The project has evolved from a city builder into a campaign-scale world simulator with a streamed 3D RPG client. The renderer, Azgaar import, macro atlas, vector map, terrain streaming, vegetation LOD, player movement, and voxel prototype are already substantial. The next priority is to make the imported world evolve through deterministic economic, political, demographic, and RPG systems.

This roadmap splits the work into twelve implementation plans. The plans are ordered by dependency, not by visual appeal.

## Product model

The product has three layers:

1. **World definition** — immutable imported geography and authored content.
2. **World simulation** — authoritative mutable state for settlements, populations, markets, factions, conflicts, routes, parties, and events.
3. **Local 3D realization** — streamed terrain, objects, NPCs, encounters, combat, and player interaction around the active location.

Azgaar data initializes the world but is not the mutable runtime database. Rendering chunks remain a terrain-streaming concern and are not economic or political regions.

## Shared architectural invariants

All plans must preserve these rules:

- Stable entity IDs are deterministic and serialized.
- Cross-entity references use IDs, never JavaScript object references.
- Simulation time uses fixed steps and never depends on render FPS.
- Simulation randomness is seeded per subsystem and event.
- No `Math.random()` in authoritative simulation code.
- Global simulation does not require terrain chunks to be resident.
- Distant populations are aggregated; individuals are instantiated only when needed.
- Promotion from aggregate to local simulation preserves quantities and identity.
- Goods, money, population, military units, and inventories follow conservation rules.
- Player actions modify the same authoritative state used by the macro simulation.
- LLM output may provide prose and presentation, but never owns canonical outcomes.
- Configuration belongs in YAML rather than hard-coded constants.
- Expensive work is scheduled or worker-backed and does not enter the render-critical path.
- Save migrations, replay, checksums, and diagnostic reasons are designed with each system, not added later.

## Plans

| Order | Area | Plan |
|---:|---|---|
| 1 | Canonical simulation model | `01-canonical-simulation-world-model-plan-2026-07-24.md` |
| 2 | Macro geographic graph | `02-macro-geographic-graph-plan-2026-07-24.md` |
| 3 | Deterministic time and scheduling | `03-deterministic-time-scheduler-plan-2026-07-24.md` |
| 4 | Settlement economy | `04-settlement-economy-stock-flow-plan-2026-07-24.md` |
| 5 | Logistics and trade | `05-logistics-and-trade-plan-2026-07-24.md` |
| 6 | Population and settlement simulation | `06-population-and-settlement-simulation-plan-2026-07-24.md` |
| 7 | Factions, politics, and conflict | `07-factions-politics-and-conflict-plan-2026-07-24.md` |
| 8 | RPG consequence pipeline | `08-rpg-consequence-pipeline-plan-2026-07-24.md` |
| 9 | Hierarchical simulation LOD | `09-hierarchical-simulation-lod-plan-2026-07-24.md` |
| 10 | Persistence, replay, and debugging | `10-persistence-replay-and-debugging-plan-2026-07-24.md` |
| 11 | Combat and NPC systems | `11-combat-and-npc-systems-plan-2026-07-24.md` |
| 12 | Visualization and UX polish | `12-visualization-and-ux-polish-plan-2026-07-24.md` |

## Dependency graph

```text
01 Canonical model
├── 02 Geographic graph
├── 03 Time and scheduler
└── 10 Persistence foundations

02 Geographic graph
├── 05 Logistics and trade
├── 07 Factions and conflict
└── 08 RPG travel and consequences

03 Time and scheduler
├── 04 Economy
├── 06 Population
├── 07 Politics
├── 09 Simulation LOD
└── 10 Replay

04 Economy
└── 05 Logistics

04 Economy + 05 Logistics + 06 Population + 07 Factions
└── 08 RPG consequence pipeline

08 RPG consequence pipeline + 09 Simulation LOD
└── 11 Combat and NPC systems

All systems
└── 12 Visualization and UX polish
```

Plan 10 is listed tenth because its full implementation depends on the prior models, but its minimum foundations—schema versions, deterministic IDs, command envelopes, and checksums—must begin during Plan 1.

## First playable vertical slice

The first milestone must prove the complete macro-to-local loop:

1. Import one Azgaar world.
2. Select one state, two provinces, and three burgs.
3. Initialize population, production, inventories, and treasury for those burgs.
4. Build road connections between them.
5. Run deterministic daily production and consumption.
6. Create a real grain shipment between two burgs.
7. Add one dangerous route segment caused by a monster or bandit site.
8. Generate a contract from the blocked shipment.
9. Let the player travel to the route in the streamed 3D world.
10. Resolve the encounter through the local RPG layer.
11. Update route safety and shipment state.
12. Deliver the goods and recalculate prices and food security.
13. Display the economic and political consequences on the world map.
14. Save, reload, and replay the scenario to the same checksum.

This slice is the acceptance target shared by Plans 1–11. Visual polish in Plan 12 may improve presentation but may not redefine the simulation rules.

## Delivery waves

### Wave A — simulation kernel

Plans 1, 2, 3, and the foundational part of Plan 10.

Outcome:

- Stable world entities.
- Geographic connectivity.
- Deterministic clock.
- Commands, events, snapshots, and checksums.

### Wave B — living settlements

Plans 4, 5, and 6.

Outcome:

- Production and consumption.
- Prices and inventories.
- Physical shipments.
- Population cohorts, health, employment, and migration.

### Wave C — political and RPG causality

Plans 7 and 8.

Outcome:

- Factions with transparent goals and relationships.
- Contracts generated from world problems.
- Player actions that create persistent consequences.

### Wave D — campaign scale and local play

Plans 9, 10, and 11.

Outcome:

- Aggregate, regional, and local simulation tiers.
- Robust save, replay, and diagnostic tooling.
- Combat and NPC systems connected to canonical world state.

### Wave E — presentation

Plan 12.

Outcome:

- Economy, politics, logistics, events, and consequences are understandable in the map and local UI.

## Global acceptance gates

The roadmap is complete only when:

- The same seed, imported map, command log, and configuration produce the same checksum.
- A campaign can advance one simulated year without unbounded memory growth.
- Distant simulation does not force terrain or object rendering residency.
- Aggregate-to-local promotion and demotion preserve population, cargo, money, and persistent identities.
- The first playable vertical slice survives save, reload, and replay.
- Every major AI or simulation decision exposes machine-readable reason codes.
- No plan introduces a mandatory global octree or per-citizen global simulation.
- `npm test`, `npm run build`, and production asset validation remain green.

## Explicit non-priorities

Until the vertical slice passes, do not prioritize:

- Multiplayer.
- Hundreds of commodities.
- Global individual citizen simulation.
- Free-form LLM ownership of world state.
- Detailed family genetics.
- Large class or spell catalogues.
- Seamless interiors for every building.
- Tactical warfare breadth.
- More renderer overhauls without a measured blocker.
- Every Azgaar editor-only visual layer.
