# Plan 12 — Visualization and UX polish

Status: Proposed  
Priority: 12  
Depends on: Plans 1–11  
Blocks: player comprehension, balancing, and release readiness

## Goal

Make the world simulation understandable and playable through clear campaign-map overlays, local HUDs, inspectors, timelines, alerts, time controls, and causal explanations.

The project already has a strong vector world map and streamed 3D presentation. This plan exposes the new economy, logistics, population, factions, conflicts, contracts, and simulation LOD without redesigning the renderer or duplicating simulation authority in UI state.

## Scope

Implement:

- Campaign dashboard and time controls.
- Economy, trade, population, faction, conflict, and contract overlays.
- Settlement, route, faction, shipment, and event inspectors.
- Local RPG HUD and interaction panels.
- Alerts, rumours, and notification prioritization.
- Timeline and world-history browser.
- Causal explanation panels using subsystem reason codes.
- Save, replay, and diagnostic surfaces.
- Performance-aware layer loading and query projections.
- Accessibility and input consistency.

## Non-goals

- Another terrain or vegetation overhaul.
- Recreating every Azgaar editor-only layer.
- UI-owned simulation calculations.
- Hiding incomplete systems behind decorative dashboards.
- Dense real-time trade animation across the entire world by default.

## UX principles

- Show the consequence before the decoration.
- Present current state, trend, and cause together.
- Keep macro and local views connected through canonical entity IDs.
- Use the same terms as the simulation model.
- Never infer authoritative values in the UI.
- Make uncertainty explicit.
- Support keyboard, mouse, and clear focus states.
- Keep expensive visual layers opt-in and bounded.
- Preserve a clean playable default while offering deep inspection.

## Information hierarchy

### Level 1 — immediate attention

- Current date and speed.
- Active danger.
- Contract objective and deadline.
- Critical settlement shortage.
- Shipment interruption.
- War declaration or border closure.
- Save or simulation error.

### Level 2 — operational status

- Settlement food security.
- Treasury and production.
- Route danger and capacity.
- Population trend.
- Faction stance.
- Active construction.
- Nearby opportunities.

### Level 3 — analysis

- Price components.
- Production and consumption flows.
- Migration reasons.
- Faction decision contributions.
- Route cost breakdown.
- Replay checksum and simulation diagnostics.

## Campaign header

Add a compact persistent header in world-map mode:

- World date.
- Pause/resume.
- Speed selector.
- Step hour/day controls in development or advanced mode.
- Simulation backlog indicator.
- Important event counter.
- Current selected state, province, or settlement.

Unsafe local combat may cap acceleration and display the reason.

## Map modes

The existing vector map provides political, province, culture, religion, biome, height, and physical views. Add simulation modes as query-driven projections.

### Economy

Encodings:

- Settlement production specialization.
- Food security.
- Wealth or treasury.
- Commodity shortage or surplus.
- Price heatmap for selected commodity.
- Resource sites and facility status.

### Trade and logistics

Encodings:

- Route type and condition.
- Capacity utilization.
- Danger.
- Shipment count or cargo value.
- Closed borders and tariffs.
- Selected shipment path and ETA.

Avoid animating every shipment by default. Use aggregated flow widths or selected-entity animation.

### Population

Encodings:

- Population size and trend.
- Housing pressure.
- Health.
- Employment.
- Migration inflow and outflow.
- Cultural or religious composition.
- Unrest.

### Factions and conflict

Encodings:

- Political control.
- Influence.
- Claims.
- Alliances and hostilities.
- Closed borders.
- Military companies.
- Occupation and active conflicts.

### RPG opportunities

Encodings:

- Known rumours.
- Offered contracts.
- Active objectives.
- Encounter sites.
- Deadlines and route relevance.

Unknown opportunities remain hidden according to visibility rules.

## Layer architecture

```text
canonical simulation queries
→ immutable view projection
→ map layer model
→ renderer-specific drawing
```

Each layer declares:

- Stable layer ID.
- Required query projection.
- Revision dependency.
- Legend definition.
- Selection and hover fields.
- Maximum item count.
- Aggregation strategy.
- Whether it updates while the map is closed.

Map layers must not read mutable subsystem maps directly.

## Inspectors

### Settlement inspector

Tabs or sections:

- Overview.
- Population.
- Economy.
- Inventory.
- Facilities and construction.
- Trade.
- Factions and policies.
- Contracts and events.

Every metric includes trend and main cause where available.

### Route inspector

Show:

- Endpoints and route type.
- Distance and base time.
- Condition.
- Capacity and reservations.
- Danger and source sites.
- Owner and access policy.
- Toll and tariff.
- Selected path contribution.
- Active or delayed shipments.

### Shipment inspector

Show:

- Cargo.
- Origin and destination.
- Carrier.
- Current status.
- Route progress.
- ETA.
- Cost and risk breakdown.
- Contracts.
- Recent events.

### Faction inspector

Show:

- Territory and influence.
- Leader.
- Treasury and military.
- Goals and claims.
- Policies.
- Relationships by dimension.
- Active agreements and conflicts.
- Recent decisions with reasons.

### Character and encounter inspector

Show persistent identity, faction, condition, contract binding, local status, and history. Development mode may expose actor revisions and Tier bindings.

## Causal explanations

Use stable reason codes emitted by simulation systems.

Examples:

```text
Food price increased 18%
- stock below 6-day reserve
- shipment delayed 3 days
- population increased 2%
- previous price smoothing limited the daily change
```

```text
Faction closed the border
- high border tension
- active territorial claim
- low trade dependency
- recent caravan seizure
```

The UI formats reasons. It does not recalculate them.

## Timeline and history

Provide a filterable timeline for important events:

- World.
- Region.
- Settlement.
- Faction.
- Character.
- Shipment.
- Contract.
- Conflict.

Features:

- Jump to location.
- Open related entity.
- Filter by event type.
- Compare before and after values where available.
- Mark player-caused events.
- Export a compact campaign recap.

## Alerts and notifications

Alert priorities:

- Critical: active combat, save corruption, settlement collapse, contract deadline imminent.
- High: shipment blocked, war declared, border closed, famine threshold crossed.
- Normal: contract available, construction completed, market change, migration event.
- Low: routine arrival, minor price movement, background diplomatic change.

Deduplicate repeated alerts by entity and reason. Allow the player to mute categories without hiding canonical state.

## Local RPG HUD

Minimum local HUD:

- Health, stamina, and optional mana.
- Current target.
- Active conditions.
- Contract objective and distance.
- Interaction prompt.
- Nearby party or escort status.
- Cargo or protected-entity status when relevant.

Keep the HUD sparse. Deep economy and faction details belong in inspectors or the world map.

## Transition between map and world

Required flow:

- Select settlement, route, shipment, contract, or encounter on the map.
- Inspect canonical information.
- Choose travel or focus action.
- Move the player or set a navigation target using canonical coordinates.
- Close map and retain objective context.
- Reopen map centered on the player and selected entity.

Display when the local 3D representation is approximate, pending activation, or unavailable.

## Simulation LOD visibility

Development and advanced inspection should show:

- Tier A/B/C region bounds.
- Entity tier.
- Promotion reason.
- Pending transition.
- Local manifest revision.
- Aggregate versus local representation.

Production mode hides technical tier labels unless needed for a clear loading or approximation message.

## Save and replay UX

Provide:

- Save status and last verified tick.
- Manual save.
- Named campaign slots.
- Corruption or migration error details.
- Replay fixture loader in development mode.
- Checksum and divergence panel.
- Export diagnostic report.

Never report success before the transactional save manifest is committed.

## Performance strategy

- Build view projections only when their source revision changes.
- Keep map-mode aggregation separate from local 3D rendering.
- Use bounded histories and visible-window sampling.
- Virtualize long event and entity lists.
- Aggregate distant flows.
- Do not rebuild all overlays every simulation tick.
- Schedule heavy projection work outside the render-critical frame path where required.
- Measure layer build time, draw count, memory, and interaction latency.

## Accessibility and controls

- Keyboard navigation for map controls and inspectors.
- Visible focus indicators.
- Text alternatives for colour-only states.
- Icons plus labels for critical conditions.
- Configurable text scale where practical.
- Avoid relying only on red/green contrast.
- Consistent Escape behaviour for map, inspector, and pointer lock.
- Tooltips that remain optional rather than hiding essential information.

## Configuration

```yaml
ui:
  simulation:
    defaultMapMode: political
    maximumVisibleShipments: 500
    maximumTimelineEvents: 5000
    priceHistoryDays: 180
    alertDeduplicationHours: 12
    showAdvancedReasons: false
    showSimulationLodDebug: false
    animateSelectedTradeRoute: true
```

Layer defaults, thresholds, and legend ranges belong in YAML or dedicated UI configuration.

## Implementation phases

### Phase 0 — query projections and design contracts

- Define immutable view models for settlement, route, shipment, faction, contract, and event data.
- Define map layer registry.
- Add projection revision tests.
- Establish terminology and legend rules.

### Phase 1 — vertical-slice dashboard

- Add date and speed controls.
- Add three-burg settlement inspectors.
- Add food-security and grain-price overlay.
- Add selected shipment route, danger, and ETA.
- Add active contract objective.

### Phase 2 — economy and population analysis

- Add production, consumption, inventory, labour, health, housing, and migration views.
- Add causal price and shortage explanations.
- Add bounded history charts only where they answer operational questions.

### Phase 3 — factions and conflict

- Add faction inspector, claims, agreements, border policy, military companies, and conflict overlays.
- Add decision reason explanations.
- Add timeline integration.

### Phase 4 — local RPG integration

- Add minimal HUD.
- Bind map selection to navigation target.
- Show encounter, escort, cargo, and objective state.
- Add map-to-local and local-to-map continuity.

### Phase 5 — diagnostics, accessibility, and polish

- Add save/replay panels.
- Add simulation LOD development overlay.
- Add keyboard navigation and non-colour indicators.
- Measure and optimize projection and interaction latency.
- Add visual regression captures for major map modes.

## Acceptance gates

- A player can identify why one settlement lacks food and what shipment may resolve it.
- Selecting that shipment shows cargo, route, ETA, risk, and contract binding.
- Completing the local encounter updates map values without manual refresh or duplicated UI state.
- Faction decisions and price changes show structured causes.
- Time controls operate the authoritative scheduler.
- Unknown opportunities remain hidden until discovered.
- Map overlays remain responsive on a large imported world through aggregation and revision caching.
- Save status reflects transactional persistence truthfully.
- Critical information is understandable without colour alone.
- The default UI remains playable without enabling advanced diagnostics.

## Testing

Required suites:

- Query projection revision caching.
- Map layer visibility and filtering.
- Selection persistence across map close/open.
- Time-control command integration.
- Alert deduplication.
- Contract objective update after canonical event.
- Inspector reason-code formatting.
- Save-status state machine.
- Keyboard navigation.
- Large-map overlay performance.
- Visual regression captures for core modes.

## Observability

Expose development metrics:

- Projection build time by layer.
- Layer item counts.
- Cache hits and invalidations.
- Inspector query duration.
- Timeline virtualization count.
- Alert deduplication count.
- Map interaction latency.
- Draw calls and memory by map mode where measurable.
- Stale view-model rejection count.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Dashboard grows before systems work | Vertical-slice views first and source-revision contracts |
| UI duplicates simulation logic | Query projections and reason codes from authoritative systems |
| Large maps overwhelm overlays | Aggregation, limits, caching, and selected-detail rendering |
| More visual work distracts from simulation | Keep this plan last and forbid renderer overhaul without evidence |
| Players cannot understand causes | Pair metric, trend, and reason breakdown |

## Done definition

Plan 12 is complete when players can operate time, inspect settlements and routes, understand economic and political causes, follow contracts from the map into local gameplay, observe persistent consequences, and use save/replay tools without the UI becoming a second simulation authority or a performance bottleneck.
