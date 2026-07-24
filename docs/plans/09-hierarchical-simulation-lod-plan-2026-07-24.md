# Plan 09 — Hierarchical simulation LOD

Status: Proposed  
Priority: 9  
Depends on: Plans 1–8  
Blocks: Plan 11 and campaign-scale performance acceptance

## Goal

Run a living campaign-scale world by simulating distant regions in aggregate, nearby regions in detail, and only the player's immediate area as instantiated 3D entities.

Simulation level of detail must be separate from rendering level of detail. Terrain and vegetation residency must not decide whether settlements, shipments, factions, or conflicts continue to exist or advance.

## Current gap

The project already streams terrain, vegetation, voxels, and local chunk content around the active camera. However, placed objects are still globally stored and are not independently simulation-LOD streamed. The new world simulator requires explicit ownership, promotion, demotion, and reconciliation for simulation entities.

## Scope

Implement:

- Three simulation tiers.
- Interest and relevance scoring.
- Region, settlement, route, party, and encounter ownership.
- Tier transition commands.
- Aggregate-to-detailed promotion.
- Detailed-to-aggregate demotion.
- Local instantiation manifests.
- Budgeted activation and deactivation queues.
- Conservation and identity reconciliation.
- Per-tier update cadence and data retention.
- Soak tests for movement across the world.

## Non-goals

- A global octree.
- Making every distant entity a local NPC.
- Terrain mesh LOD redesign.
- Full multiplayer replication.
- GPU readbacks for gameplay state.

## Simulation tiers

### Tier A — Global aggregate

Used for most of the world.

Representations:

- Settlement totals and cohort summaries.
- Daily or monthly economy batches.
- Aggregate shipments.
- Faction goals and policies.
- Military companies.
- Abstract encounter pressure.
- Region-level danger and stability.

Characteristics:

- No local meshes or NPC entities.
- Coarse cadence.
- Bounded history.
- Exact totals for conserved quantities.

### Tier B — Regional detailed

Used for the player's province, neighbouring settlements, active contracts, tracked factions, and nearby routes.

Representations:

- Individual shipments.
- Named faction leaders and merchants.
- Settlement construction queues.
- Route-segment danger.
- Military companies with detailed composition.
- Persistent encounter sites.
- More frequent updates.

### Tier C — Local instantiated

Used around the player and current local encounter.

Representations:

- Individual NPCs and creatures.
- Combatants.
- Vehicles, wagons, and ships.
- Visible cargo objects.
- Building interaction state.
- Local pathfinding, physics, and combat.

Tier C is bounded by a strict entity and memory budget.

## Tier authority

The canonical entity remains the authority at every tier. Tier-specific representations are projections or child records.

Example:

```text
Shipment entity
├── Tier A: aggregate cargo, route, ETA, escort strength
├── Tier B: carrier, named leader, detailed guards, edge progress
└── Tier C: spawned wagon, guards, cargo containers, local encounter state
```

Never create unrelated replacement identities at a transition.

## Interest model

Tier selection considers:

- Distance from player canonical position.
- Current province and neighbouring provinces.
- Active contract involvement.
- Tracked or pinned entities.
- Imminent scheduled event.
- Direct faction relationship.
- Current combat or danger.
- UI inspection.
- Recent player interaction.

Each reason contributes to an explicit interest score or minimum tier.

Example rules:

- Current local encounter: Tier C.
- Active contract target within configured range: Tier C or B.
- Same province: at least Tier B.
- Pinned settlement: Tier B.
- Distant inactive settlement: Tier A.

Use hysteresis and cooldowns to prevent tier thrashing.

## Ownership hierarchy

```text
World
├── Region simulation owner
│   ├── Settlement owners
│   ├── Route-segment owners
│   ├── Resource-site owners
│   └── Encounter-site owners
└── Local activation owner
    ├── Terrain chunk content manifests
    ├── NPC spawn manifests
    ├── Shipment manifestations
    └── Combat manifestations
```

Rendering chunks may cache local manifestations, but canonical ownership uses region, settlement, route, or encounter IDs.

## Promotion contract

A promotion operation:

1. Validates source entity revision.
2. Freezes relevant aggregate mutation for the transition transaction.
3. Expands aggregate quantities into detailed records using deterministic rules.
4. Assigns persistent IDs where identity matters.
5. Produces a local or regional manifest.
6. Validates conservation.
7. Commits tier state and representation bindings.

Promotion example:

```text
40 grain + 6 aggregate guards
→ one cargo inventory with 40 grain
→ one carrier
→ one persistent leader if configured
→ five generated guard records
→ local spawn manifest
```

## Demotion contract

A demotion operation:

1. Collects surviving detailed or local state.
2. Resolves pending local events.
3. Returns cargo, headcount, health, equipment, progress, and condition to canonical entities.
4. Retains important named identities and history.
5. Merges disposable records into aggregate cohorts or company counts.
6. Validates conservation.
7. Releases local resources.

Demotion must be idempotent and resumable after interruption.

## Local content provider integration

The existing local-first content provider chain should return authored or generated local content manifests. Extend it so manifests may reference canonical simulation IDs and revisions.

```js
{
  contentVersion,
  canonicalLocation,
  sourceRevision,
  settlementId,
  encounterIds,
  objectPlacements,
  npcBindings,
  shipmentBindings,
  persistenceKeys
}
```

A stale manifest is rebuilt or reconciled before activation.

## Budget model

Configuration:

```yaml
simulation:
  lod:
    regionalRadiusKm: 100
    localRadiusKm: 2
    regionalHysteresisKm: 20
    localHysteresisKm: 0.5
    minimumTierHoldHours: 2
    maxTierBSettlements: 64
    maxTierBShipments: 512
    maxTierCCharacters: 200
    maxPromotionsPerFrame: 2
    maxDemotionsPerFrame: 4
    transitionBudgetMs: 3
```

Budgets are separate from terrain `loadRadius`, vegetation radii, or GPU slot counts.

## Update cadence by tier

| System | Tier A | Tier B | Tier C |
|---|---|---|---|
| Settlement economy | Daily aggregate | Hourly/daily detailed | Event-driven plus hourly |
| Population | Monthly | Daily/monthly | Local needs for instantiated NPCs |
| Shipments | Daily edge progress | Hourly progress | Fixed/local update |
| Factions | Monthly/quarterly | Weekly/monthly | Event-driven local reactions |
| Encounters | Pressure model | Persistent site state | Instantiated gameplay |
| Military | Weekly/daily aggregate | Daily companies | Local squads/combat |

## Implementation phases

### Phase 0 — tier contracts

- Define tier enum and representation bindings.
- Define promotion/demotion transaction envelopes.
- Add conservation validators by entity kind.
- Add tier reason and minimum-tier diagnostics.

### Phase 1 — settlement and shipment Tier A/B

- Keep all settlements in Tier A by default.
- Promote current and neighbouring provinces to Tier B.
- Promote active-contract shipments to Tier B.
- Add cooldown and hysteresis.

### Phase 2 — local shipment promotion

- Promote the vertical-slice caravan into Tier C.
- Spawn carrier, guards, and cargo bindings.
- Demote after leaving range.
- Verify exact cargo and headcount round trip.

### Phase 3 — local encounter and NPC promotion

- Promote encounter sites and named persons.
- Add resumable local manifests.
- Add interrupted transition recovery.
- Add persistent local damage and cleared-state handling.

### Phase 4 — budgeted queues

- Add promotion and demotion queues.
- Prioritize current danger and active contracts.
- Enforce per-frame and total entity budgets.
- Keep previous valid representation until replacement is ready.

### Phase 5 — campaign soak and tuning

- Travel across many provinces.
- Advance one simulated year while moving.
- Verify bounded memory and active entity counts.
- Tune tier radii and cadences from measurements.

## Acceptance gates

- Distant settlements continue economy and population updates with no local entities.
- Entering a province promotes only bounded relevant records.
- Leaving a province releases detailed records after hysteresis.
- Aggregate-to-local shipment promotion preserves cargo, headcount, identities, progress, and contracts.
- A transition failure leaves the previous representation valid.
- Terrain chunk eviction does not delete simulation state.
- Simulation tier changes do not alter deterministic outcomes beyond explicitly documented model differences.
- Memory remains bounded during repeated long-distance travel.
- No gameplay system requires GPU readback.

## Testing

Required suites:

- Tier reason evaluation.
- Hysteresis and minimum hold time.
- Promotion transaction rollback.
- Demotion idempotence.
- Shipment aggregate/local round trip.
- Named NPC retention.
- Encounter resume after reload.
- Repeated province-crossing memory bound.
- One-year campaign soak.
- Tier-independent conservation checks.

## Observability

Expose:

- Entity count by tier and kind.
- Promotion/demotion queue length and age.
- Transition duration.
- Tier reasons and minimum-tier overrides.
- Conservation residuals.
- Local manifest rebuild count.
- Stale transition rejection count.
- Memory estimates by tier.
- Active regional and local bounds on the map.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Tier transitions duplicate or lose state | Atomic transitions and conservation validators |
| Player movement causes thrashing | Hysteresis and minimum hold time |
| Renderer becomes simulation authority | Canonical IDs and independent tier manager |
| Transition work causes hitches | Budgeted queues and old-representation retention |
| Tier models diverge | Shared canonical entities and cross-tier equivalence tests |

## Done definition

Plan 09 is complete when the full world advances in bounded aggregate form, nearby regions gain detail, local entities instantiate only around relevant gameplay, and repeated promotion/demotion preserves all canonical quantities and persistent identities without render-path hitches or unbounded memory growth.
