# Plan 04 — Settlement economy and stock-flow model

Status: Proposed  
Priority: 4  
Depends on: Plans 1 and 3  
Blocks: Plans 5, 6, 7, and 8

## Goal

Create a deterministic settlement economy in which population, buildings, resource sites, inventories, labour, production, consumption, taxes, upkeep, and prices interact through explicit stock-and-flow rules.

The economy must generate shortages, surpluses, profitable trade, construction pressure, political tension, and RPG opportunities without creating goods or money from nowhere.

## Scope

Implement:

- Commodity registry.
- Settlement inventories and storage limits.
- Production recipes and facilities.
- Labour allocation.
- Population and institutional consumption.
- Construction and upkeep demand hooks.
- Market price calculation.
- Treasury, taxes, wages, and payments.
- Transaction ledger and conservation checks.
- Deterministic daily economy update.
- Economy diagnostics and world-map query data.

## Non-goals

- Hundreds of commodities.
- Individual shop inventories across the whole world.
- High-frequency order-book trading.
- Realistic modern finance.
- LLM-decided prices or production.
- Detailed logistics movement, which belongs to Plan 05.

## Initial commodity set

Start small and extensible:

- Food.
- Grain.
- Livestock.
- Wood.
- Stone.
- Iron ore.
- Iron.
- Tools.
- Textiles.
- Medicine.
- Weapons.
- Luxury goods.
- Magical materials.
- Coin.

Commodity definitions belong in YAML:

```yaml
commodities:
  grain:
    category: food_input
    unitMassKg: 1
    baseValue: 1
    spoilagePerDay: 0.002
    strategic: true
  tools:
    category: manufactured
    unitMassKg: 5
    baseValue: 25
    spoilagePerDay: 0
    strategic: true
```

Do not encode commodity behaviour in long `switch` statements.

## Core state

### Settlement economy

```js
{
  settlementId,
  marketId,
  treasuryAccountId,
  inventoryAccountIds,
  facilityIds,
  labourPoolId,
  taxPolicyId,
  priceState,
  revision
}
```

### Inventory account

```js
{
  id,
  ownerEntityId,
  locationId,
  capacityMassKg,
  quantities,
  reserved,
  revision
}
```

`available = quantity - reserved`. Shipment planning and construction reserve stock rather than subtracting it prematurely.

### Production facility

```js
{
  id,
  ownerEntityId,
  settlementId,
  recipeId,
  level,
  condition,
  workerCapacity,
  assignedWorkers,
  efficiency,
  inputInventoryId,
  outputInventoryId,
  status
}
```

### Production recipe

```yaml
recipes:
  smelt_iron:
    durationHours: 24
    workers: 8
    inputs:
      iron_ore: 10
      wood: 4
    outputs:
      iron: 6
    facilityTags: [smelter]
```

## Building integration

Extend `config/objects.yaml` with optional simulation components rather than creating a second unrelated building catalogue.

```yaml
simulation:
  construction:
    materials:
      wood: 40
      stone: 10
    laborDays: 30
  employment:
    capacity: 6
    professions: [farmer]
  production:
    recipe: grow_grain
    batchesPerDay: 1
  storage:
    capacityMassKg: 500
  upkeep:
    coinPerDay: 2
```

The renderer continues to use visual fields. Simulation reads only the `simulation` component.

## Accounting rules

Every quantity change must be represented by a transaction or production event.

```text
closing stock =
  opening stock
  + production
  + imports received
  + transfers received
  - consumption
  - exports dispatched
  - transfers sent
  - spoilage
  - destruction
```

Coin transfers must debit one account and credit another unless explicitly marked as minting, taxation destruction, or scenario setup.

Use integer minor units for coin and fixed-point integers for commodity quantities where fractional units are needed.

## Daily economy pipeline

Run in deterministic phases:

1. Apply arrivals and completed construction from the prior tick.
2. Calculate available workers.
3. Allocate labour according to policy and minimum-needs priorities.
4. Reserve production inputs.
5. Execute production batches.
6. Apply household and institutional consumption.
7. Apply upkeep and facility degradation.
8. Apply spoilage.
9. Calculate shortages and surplus targets.
10. Clear local market transfers.
11. Update prices using smoothed stock pressure.
12. Emit import demand and export offers for Plan 05.
13. Validate conservation and commit the day.

A failure in one settlement economy update must not partially commit its transactions.

## Price model

Use a bounded, explainable model rather than uncontrolled emergent bidding.

Suggested inputs:

- Base value.
- Days of stock at current consumption.
- Unmet demand.
- Recent import cost.
- Recent production cost.
- Strategic reserve policy.
- Price smoothing from previous day.

```text
targetDays = configured reserve target
stockPressure = clamp(targetDays / max(actualDays, epsilon), min, max)
demandPressure = 1 + unmetDemandRatio × demandWeight
rawPrice = baseValue × stockPressure × demandPressure
price = lerp(previousPrice, rawPrice, smoothing)
```

Expose every component in diagnostics. Set configurable floors and ceilings to prevent numeric explosions during early balancing.

## Labour model

Population cohorts provide workers by profession and skill tier. Facilities request workers. Allocation policy begins with deterministic priority order:

1. Food production.
2. Water and health services.
3. Essential upkeep.
4. Strategic production.
5. Export production.
6. Luxury production.

Later policies may vary by faction or settlement government, but the allocation reason must remain inspectable.

## Configuration

```yaml
simulation:
  economy:
    updateCadence: daily
    quantityScale: 1000
    coinMinorUnits: 100
    defaultReserveDays: 14
    priceSmoothing: 0.2
    minimumPriceMultiplier: 0.1
    maximumPriceMultiplier: 20
    strictConservation: true
    maxTransactionsPerSettlementDay: 5000
```

## Implementation phases

### Phase 0 — commodity and ledger contracts

- Define commodity registry validation.
- Define fixed-point quantity helpers.
- Implement inventory accounts and reservations.
- Implement balanced coin transfers.
- Add conservation property tests.

### Phase 1 — settlement initialization

- Initialize three vertical-slice burgs from Azgaar metadata.
- Derive conservative starting population, facilities, inventories, and treasury from explicit configuration rules.
- Record initialization as world-setup events.
- Avoid fake precision from Azgaar population values where source fields are absent.

### Phase 2 — production and consumption

- Implement facility recipes.
- Implement labour assignment.
- Implement daily production batches.
- Implement household food and essential consumption.
- Implement storage limits, spoilage, and shortages.

### Phase 3 — local market and prices

- Implement internal transfers between settlement accounts.
- Implement price state and smoothing.
- Emit import demand and export offers.
- Add price history ring buffers with bounded retention.

### Phase 4 — buildings and construction hooks

- Read economic components from `config/objects.yaml`.
- Add construction material reservations.
- Add upkeep and facility condition.
- Add disabling and repair events.

### Phase 5 — balancing and diagnostics

- Add deterministic economy scenario runner.
- Add one-year soak test.
- Add shortage, surplus, and production dashboards.
- Add configurable scenario fixtures.

## Acceptance gates

- A closed three-settlement economy runs for one simulated year deterministically.
- Commodity and coin conservation checks pass every day.
- A food production failure creates a measurable shortage and price increase.
- Restoring production reduces shortage and prices gradually rather than instantly.
- Labour cannot be assigned above available workforce.
- Reserved goods cannot be double-spent by production, construction, or shipment planning.
- Building economic behaviour is configuration-driven.
- No daily update requires local terrain or building meshes to be resident.

## Testing

Required suites:

- Recipe input/output conservation.
- Insufficient-input production rejection.
- Inventory reservation and release.
- Storage overflow policy.
- Spoilage over multiple days.
- Labour over-allocation rejection.
- Price response to shortage and surplus.
- Balanced coin transfers.
- Save/reload exact economy state.
- One-year deterministic soak test.

## Observability

Expose per settlement:

- Production and consumption by commodity.
- Opening and closing inventory.
- Reserved stock.
- Unmet demand.
- Price and component breakdown.
- Workers available and assigned.
- Facility utilization and condition.
- Treasury balance, taxes, wages, and upkeep.
- Conservation residual, which must remain zero.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Economy becomes impossible to balance | Small commodity set, bounded prices, scenario runner |
| Goods duplicate across systems | Central inventory transactions and reservations |
| Floating-point drift | Fixed-point integer quantities |
| Buildings and economy diverge | Shared YAML object definitions with simulation components |
| One giant daily transaction list | Settlement-scoped atomic batches and bounded history |

## Done definition

Plan 04 is complete when settlements produce, consume, store, reserve, price, and account for a small commodity set deterministically; shortages and surpluses emerge from real stock changes; and every balance can be explained from a transaction ledger.
