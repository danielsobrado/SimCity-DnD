# Plan 05 — Logistics and trade

Status: Proposed  
Priority: 5  
Depends on: Plans 1–4  
Blocks: Plans 7, 8, and 9

## Goal

Move real goods, coin, people, and strategic supplies through the macro geographic graph using persistent shipments with route capacity, travel time, cost, risk, ownership, and arrival consequences.

Trade must connect economic pressure to geography and RPG gameplay. A shortage should create demand. A shipment should reserve and remove real stock. A blocked route should delay or destroy actual cargo. A successful player intervention should change the same shipment and market state.

## Scope

Implement:

- Import demand and export offer matching.
- Shipment planning and inventory reservation.
- Route selection and capacity reservation.
- Carriers and transport modes.
- Departure, progress, delay, reroute, interception, and arrival.
- Transport cost, tariffs, tolls, and insurance hooks.
- Aggregate shipment simulation.
- Promotion to local caravan, ship, or party entities near the player.
- Trade history and diagnostics.
- RPG contract hooks for threatened or failed shipments.

## Non-goals

- Per-wagon simulation for every distant shipment.
- Continuous traffic visualization for the entire world.
- Detailed maritime physics.
- Free-form merchant AI.
- High-frequency commodity speculation.

## Core entities

### Trade offer

```js
{
  id,
  settlementId,
  commodityId,
  kind,
  quantity,
  limitPrice,
  earliestTick,
  latestTick,
  priority,
  revision
}
```

`kind` is `buy` or `sell`.

### Shipment

```js
{
  id,
  ownerFactionId,
  originSettlementId,
  destinationSettlementId,
  cargoInventoryId,
  carrierId,
  transportMode,
  routeEdgeIds,
  currentEdgeIndex,
  progress,
  departureTick,
  expectedArrivalTick,
  status,
  riskState,
  costState,
  contractIds,
  revision
}
```

Shipment status:

- `planned`
- `reserved`
- `loading`
- `in_transit`
- `delayed`
- `blocked`
- `intercepted`
- `arrived`
- `cancelled`
- `lost`

### Carrier

Represents available transport capacity:

- Caravan.
- River barge.
- Coastal ship.
- Pack animals.
- Military convoy.
- Magical transport later.

A carrier may remain aggregate unless promoted to local simulation.

## Inventory lifecycle

Shipment cargo follows an explicit sequence:

```text
origin available stock
→ origin reserved stock
→ shipment cargo inventory
→ in-transit cargo
→ destination receiving inventory
→ destination available stock
```

Cancellation before departure releases reservations. Cancellation after departure requires rerouting, return, transfer, abandonment, or loss. Cargo may never exist simultaneously in origin and shipment inventories.

## Trade matching

Start with deterministic regional matching once per day:

1. Collect settlement buy and sell offers.
2. Sort by commodity, priority, settlement ID, and offer ID.
3. Filter unreachable or prohibited pairs.
4. Estimate route cost, tariff, risk, and delivery time.
5. Match the cheapest acceptable supply to highest-priority demand.
6. Respect stock, carrier, route, and treasury limits.
7. Create shipment plans and reserve goods and coin.

Do not optimize globally in the first implementation. A deterministic greedy matcher is easier to test and sufficient for the vertical slice.

## Route capacity

Each graph edge exposes transport capacity per interval. Shipment planning reserves capacity by time window.

Initial model:

- Capacity measured in cargo mass per day.
- Each shipment consumes capacity based on cargo mass and carrier.
- Damaged routes reduce capacity.
- Closed routes provide zero capacity.
- Military control may reserve part of capacity.
- Congestion cost is optional and disabled initially.

## Travel progression

At daily or hourly cadence:

- Advance shipment along current edge.
- Apply delays from condition, danger, access, or scripted events.
- Charge tolls or tariffs at crossings.
- Trigger arrival at edge or destination boundaries.
- Recalculate ETA when conditions change.
- Attempt reroute when blocked and policy allows.

Progress uses integer or fixed-point distance units.

## Risk model

Risk is evaluated from explicit components:

- Route danger.
- Cargo attractiveness.
- Escort strength.
- Faction hostility.
- Regional stability.
- Weather later.
- Monster or bandit site influence.

Use deterministic keyed rolls:

```text
riskRollKey = shipmentId + edgeId + riskWindowStartTick
```

The same replay produces the same encounter or loss result.

Risk outcomes:

- No incident.
- Delay.
- Partial cargo loss.
- Full interception.
- Escort casualty.
- Local encounter created.
- Contract created.

## Aggregate-to-local promotion

When the player approaches a shipment:

```text
aggregate shipment
→ reserve local spawn area
→ instantiate carrier, guards, passengers, and cargo representation
→ bind local entities to shipment ID
→ run local encounter/combat
→ collapse survivors and cargo back into shipment state when leaving
```

Promotion and demotion must preserve:

- Cargo quantities.
- Persistent guard or leader identities.
- Health and casualties.
- Carrier condition.
- Current route progress.
- Contract state.

## Configuration

```yaml
simulation:
  logistics:
    updateCadence: hourly
    matchingCadence: daily
    maxMatchesPerDay: 5000
    maxReroutesPerShipment: 3
    defaultLoadingHours: 4
    routeCapacityWindowHours: 24
    localPromotionRadiusKm: 2
    retainTradeHistoryDays: 365
    riskEvaluationHours: 6
```

Transport modes and carrier definitions belong in separate YAML registries.

## Implementation phases

### Phase 0 — shipment contracts

- Define offer, shipment, carrier, and cargo inventory schemas.
- Add reservation lifecycle tests.
- Add shipment status transition validator.
- Add deterministic risk-roll helper.

### Phase 1 — vertical-slice trade matcher

- Create grain sell offer in one burg.
- Create grain buy offer in another.
- Match using graph path cost.
- Reserve cargo and coin.
- Create one caravan shipment.

### Phase 2 — route movement and arrival

- Reserve route capacity.
- Advance progress.
- Apply tolls.
- Deliver cargo.
- Credit and debit settlement accounts.
- Release carrier and capacity reservations.

### Phase 3 — disruptions

- Block one route segment.
- Add delay, reroute, and cancellation policies.
- Add deterministic interception events.
- Generate a contract when human intervention is appropriate.

### Phase 4 — local promotion

- Spawn a local caravan bound to shipment state.
- Resolve escort or ambush encounter.
- Collapse results back into aggregate state.
- Verify conservation before and after promotion.

### Phase 5 — broader trade network

- Add multiple commodities.
- Add river and sea carriers.
- Add tariffs and faction access rules.
- Add bounded history and trade-route summaries.

## Acceptance gates

- A shipment reserves real origin stock and cannot be double-spent.
- Arrival increases real destination stock and settles payment exactly once.
- Destroying or closing one route changes shipment planning and ETA.
- A lost shipment removes or transfers cargo according to an explicit event.
- Aggregate-to-local promotion preserves cargo and persistent identities.
- Trade matching remains deterministic under equal-cost alternatives.
- Distant shipments progress without rendering their route or carrier.
- The vertical-slice grain shortage can be relieved only when the shipment actually arrives.

## Testing

Required suites:

- Buy/sell matching determinism.
- Reservation rollback after failed planning.
- Route capacity contention.
- Toll and tariff accounting.
- Blocked-route rerouting.
- Shipment loss conservation.
- Duplicate-arrival idempotence.
- Save/reload in-transit shipment.
- Aggregate/local round trip.
- One-year trade-network soak test.

## Observability

Expose:

- Shipments by status and transport mode.
- Cargo mass and value in transit.
- Route capacity utilization.
- Average delay and delivery time.
- Failed, rerouted, intercepted, and lost shipments.
- Import dependence by settlement and commodity.
- Trade balance by faction.
- Shipment cost and risk breakdown.
- Promotion/demotion conservation residual.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Trade planner becomes an expensive global optimizer | Deterministic regional greedy matching |
| Cargo duplicates during status changes | Dedicated cargo inventory and atomic transactions |
| Local encounter diverges from macro shipment | Shared shipment ID and round-trip reconciliation |
| Route changes invalidate many plans | Revisioned paths and bounded rerouting |
| Too many shipment entities | Consolidation thresholds and simulation LOD in Plan 09 |

## Done definition

Plan 05 is complete when settlements exchange real inventories through persistent shipments, routes and borders affect cost and arrival, disruptions create meaningful consequences, and one shipment can be promoted into a playable local caravan encounter and returned to aggregate simulation without losing or duplicating state.
