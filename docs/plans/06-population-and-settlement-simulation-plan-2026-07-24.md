# Plan 06 — Population and settlement simulation

Status: Proposed  
Priority: 6  
Depends on: Plans 1, 3, and 4  
Blocks: Plans 7, 8, 9, and 11

## Goal

Model settlements as evolving populations with needs, labour, health, housing, wealth, culture, religion, loyalty, migration, and institutional capacity without simulating every citizen globally.

The system must explain why settlements grow, decline, migrate, rebel, prosper, or generate RPG problems.

## Scope

Implement:

- Aggregate population cohorts.
- Age and role distribution at a coarse level.
- Labour supply and profession allocation.
- Food, housing, health, safety, and social needs.
- Births, deaths, disease pressure, and recovery.
- Wealth and poverty bands.
- Culture and religion composition.
- Loyalty, happiness, unrest, and migration pressure.
- Settlement capacity, services, and construction demand hooks.
- Named-person promotion rules for important NPCs.
- Deterministic monthly and yearly demographic updates.

## Non-goals

- Global per-citizen simulation.
- Detailed genetics or family trees.
- Individual daily schedules for distant populations.
- Fully realistic epidemiology.
- Free-form social simulation owned by an LLM.

## Population representation

Use cohorts keyed by settlement, culture, religion, age band, role, and wealth band.

```js
{
  id,
  settlementId,
  cultureId,
  religionId,
  ageBand,
  role,
  wealthBand,
  count,
  health,
  education,
  loyalty,
  revision
}
```

Recommended initial age bands:

- Child.
- Working age.
- Elder.

Recommended initial roles:

- Farmers.
- Labourers.
- Artisans.
- Merchants.
- Soldiers.
- Clergy.
- Scholars.
- Nobles.
- Unemployed.
- Displaced.

Keep the first model coarse. New dimensions must justify their simulation value and memory cost.

## Settlement social state

```js
{
  settlementId,
  populationTotal,
  housingCapacity,
  foodSecurity,
  healthCapacity,
  security,
  employmentRate,
  medianWealth,
  inequality,
  happiness,
  unrest,
  migrationPressure,
  educationAccess,
  culturalTension,
  religiousTension,
  revision
}
```

These values are derived from cohort and economy state. Avoid storing the same authority in multiple places unless one is an explicitly cached projection with revision tracking.

## Needs model

Minimum needs:

- Food.
- Housing.
- Safety.
- Health.
- Employment or livelihood.
- Social belonging.

Each need exposes:

- Current satisfaction.
- Required quantity or capacity.
- Unmet amount.
- Trend.
- Main causes.

Example:

```text
food satisfaction
= consumed food / required food

housing satisfaction
= min(1, housing capacity / population)

safety satisfaction
= function(security, crime, war, monster pressure)
```

Derived happiness and unrest must include component breakdowns rather than one opaque formula.

## Labour integration

The population model owns labour availability. The economy requests workers by profession and skill.

```text
working-age population
- soldiers mobilized
- sick or injured
- caregivers and unavailable share
= available labour
```

Labour allocation from Plan 04 returns employment and wages, which feed back into wealth, happiness, and migration.

Do not let facilities invent workers.

## Demographic update pipeline

### Daily

- Apply food consumption results.
- Update acute health and safety effects.
- Apply arrivals, departures, deaths, and births scheduled for the day.
- Update short-term happiness pressure.

### Monthly

- Recalculate employment and wealth bands.
- Apply births and expected mortality using fixed-point rates.
- Apply disease pressure and recovery.
- Update culture and religion composition from migration and conversion rules.
- Recalculate migration pressure.
- Generate construction and service demand.

### Yearly

- Age cohorts.
- Rebalance age bands.
- Update education and long-term productivity.
- Apply slow cultural and religious drift.
- Emit historical demographic events.

## Migration model

Migration occurs between settlements or into displaced populations.

Push factors:

- Food shortage.
- Unemployment.
- War.
- Persecution.
- Disease.
- Housing shortage.
- High taxes.
- Monster pressure.

Pull factors:

- Available work.
- Higher wages.
- Safety.
- Shared culture or religion.
- Family or faction ties.
- Available housing.
- Better services.

Migration uses the macro geographic graph. Movement has travel time, capacity, and risk. Large flows may become Plan 05 shipments or parties.

Use deterministic candidate ranking and configurable migration limits. Do not teleport population instantly between distant settlements.

## Named-person promotion

Most people remain in cohorts. Promote an individual only when one of these applies:

- Political or faction leadership.
- Quest relevance.
- Persistent relationship with the player.
- Military command.
- Merchant or carrier ownership.
- Witness to an important event.
- Party membership.
- Unique profession required by local content.

Promotion subtracts one person from the matching cohort and creates a persistent character entity. Demotion returns a surviving non-important character to a compatible cohort when appropriate.

The process must preserve population totals.

## Configuration

```yaml
simulation:
  population:
    updateCadence: monthly
    dailyNeedsCadence: daily
    yearlyCadenceMonths: 12
    minimumCohortSize: 5
    maximumCohortsPerSettlement: 256
    migrationEvaluationMonths: 1
    maximumMigrationSharePerMonth: 0.05
    strictPopulationConservation: true
```

Demographic rates, need weights, and migration weights should live in dedicated YAML registries.

## Implementation phases

### Phase 0 — cohort contracts

- Define cohort key grammar.
- Implement fixed-point population quantities if fractional expectations are retained.
- Add cohort merge and split utilities.
- Add population conservation tests.
- Define named-person promotion events.

### Phase 1 — settlement initialization

- Initialize cohorts for the three-burg vertical slice.
- Derive culture and religion from imported data.
- Use explicit configurable defaults for age, role, and wealth distribution.
- Store initialization assumptions in diagnostics.

### Phase 2 — needs and labour

- Calculate food and housing needs.
- Expose available labour to Plan 04.
- Apply employment and wage results.
- Compute happiness and unrest components.

### Phase 3 — health and demographics

- Add births, deaths, and health state.
- Add service-capacity effects.
- Add famine and conflict mortality hooks.
- Add monthly and yearly cohort transitions.

### Phase 4 — migration

- Rank destinations using graph reachability and pull factors.
- Create migration groups with travel state.
- Apply arrivals and departures atomically.
- Add refugee and displaced cohorts.

### Phase 5 — named NPC bridge

- Promote leaders, quest NPCs, and persistent characters.
- Bind local character entities to canonical person IDs.
- Demote eligible characters without losing totals or history.

## Acceptance gates

- Settlement population equals the sum of active cohorts and promoted residents.
- Facilities cannot employ more workers than population supplies.
- Food shortage lowers health and increases migration pressure through explicit reason components.
- A safer, better-employed settlement attracts migration only when a route exists.
- Population movement takes time and is subject to route risk.
- Named-person promotion and demotion preserve totals.
- A one-year demographic run is deterministic and bounded in cohort count.
- Distant settlements update without individual NPC entities or loaded terrain.

## Testing

Required suites:

- Cohort merge and split conservation.
- Age-band transition.
- Labour supply calculation.
- Food shortage effects.
- Housing shortage effects.
- Birth and death fixed-point accumulation.
- Migration candidate tie-breaking.
- Unreachable migration destination rejection.
- Named-person promotion/demotion round trip.
- Save/reload demographic checksum.
- Multi-year cohort-count bound.

## Observability

Expose per settlement:

- Population total and trend.
- Cohorts by age, role, culture, religion, and wealth.
- Labour available, employed, unavailable, and mobilized.
- Need satisfaction and cause breakdown.
- Births, deaths, arrivals, and departures.
- Health, happiness, unrest, and migration pressure.
- Housing and service capacity.
- Named promoted residents.
- Population conservation residual.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Cohort dimensions explode | Hard cap, minimum cohort size, deterministic merging |
| Population totals drift | Central conservation checks and promotion events |
| Demographic formulas create fake precision | Coarse bands, explicit defaults, fixed-point accumulation |
| Migration teleports people | Graph-based travel groups |
| Local NPCs disconnect from macro population | Promotion/demotion bridge with canonical IDs |

## Done definition

Plan 06 is complete when settlements can grow, decline, employ workers, suffer shortages, migrate, and promote important individuals while preserving population totals and remaining efficient at campaign scale.
