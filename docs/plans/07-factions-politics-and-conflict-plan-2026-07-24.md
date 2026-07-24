# Plan 07 — Factions, politics, and conflict

Status: Proposed  
Priority: 7  
Depends on: Plans 1–6  
Blocks: Plans 8, 9, and 11

## Goal

Turn imported states, cultures, religions, guilds, houses, orders, tribes, criminal groups, and monster societies into persistent political actors with goals, resources, relationships, claims, policies, and transparent decisions.

The system must create understandable conflict and cooperation that affect trade, population, routes, settlements, contracts, and local RPG encounters.

## Scope

Implement:

- Canonical faction entities.
- Leadership and succession hooks.
- Multi-dimensional relationships.
- Claims, interests, and strategic goals.
- Policies for trade, borders, taxation, religion, and military posture.
- Deterministic utility-based decisions.
- Diplomacy actions and agreements.
- Aggregate conflict and military companies.
- Occupation, rebellion, embargo, and peace hooks.
- Political event history and reason codes.

## Non-goals

- Full tactical warfare.
- Per-soldier global simulation.
- LLM-owned diplomacy decisions.
- Perfect historical political realism.
- Detailed court family trees.

## Faction types

Initial types:

- State.
- Noble house.
- Merchant guild.
- Religious institution.
- Military order.
- Criminal organization.
- Tribe or clan.
- Rebel movement.
- Wizard circle.
- Monster faction.
- Player-founded faction.

Azgaar states initialize state factions. Cultures and religions may initialize institutions or influence records according to configuration rather than automatically creating one faction per source record.

## Faction state

```js
{
  id,
  type,
  name,
  homeRegionId,
  controlledRegionIds,
  influencedSettlementIds,
  leaderPersonId,
  memberPopulationRefs,
  treasuryAccountId,
  militaryCompanyIds,
  policies,
  goals,
  claims,
  relationships,
  legitimacy,
  cohesion,
  riskTolerance,
  status,
  revision
}
```

## Relationship model

Do not reduce diplomacy to one reputation score.

Track bounded dimensions:

- Trust.
- Fear.
- Respect.
- Dependency.
- Grievance.
- Ideological alignment.
- Trade reliance.
- Border tension.

Derived stances such as allied, friendly, neutral, hostile, and at war are projections over these values and active agreements.

Relationship changes occur through explicit events:

- Shipment delivered or seized.
- Border violated.
- Contract fulfilled or betrayed.
- Shared enemy defeated.
- Religious persecution.
- Tribute paid.
- Leader killed.
- Treaty honored or broken.

## Claims and interests

Claims represent persistent desired control or rights:

```js
{
  id,
  factionId,
  targetType,
  targetId,
  basis,
  strength,
  priority,
  createdAtTick,
  expiresAtTick,
  status
}
```

Examples:

- Territorial claim.
- Trade-route access.
- Religious protection.
- Succession claim.
- Resource-site ownership.
- Debt or tribute claim.

Interests are softer goals such as securing food imports, weakening a rival, protecting a culture, or expanding influence.

## Decision system

Use deterministic utility scoring with explicit considerations.

```text
action utility =
  goal benefit
  + economic benefit
  + security benefit
  + ideological benefit
  + opportunity
  - material cost
  - military risk
  - diplomatic cost
  - internal opposition
```

Every evaluated action produces:

```js
{
  factionId,
  actionType,
  utility,
  selected,
  reasons: [
    { code, value, weight, contribution }
  ]
}
```

Stable tie-breaking uses action type and target ID.

Initial actions:

- Propose trade agreement.
- Set tariff.
- Open or close border crossing.
- Offer alliance.
- Demand tribute.
- Declare embargo.
- Fund route security.
- Suppress bandits.
- Mobilize military company.
- Support rebellion.
- Negotiate peace.
- Declare limited war.

Begin with a small action catalogue. Add breadth only after decisions are explainable and testable.

## Agreements

Canonical agreement entity types:

- Alliance.
- Non-aggression pact.
- Trade agreement.
- Open-border agreement.
- Tribute arrangement.
- Defensive guarantee.
- Ceasefire.
- Peace treaty.

Agreements define participants, start/end ticks, terms, breach conditions, and active status.

## Conflict model

Conflict is a persistent entity:

```js
{
  id,
  type,
  attackerFactionIds,
  defenderFactionIds,
  objectiveIds,
  startTick,
  status,
  warScore,
  exhaustion,
  occupiedRegionIds,
  battleEventIds,
  peaceOfferIds,
  revision
}
```

Initial conflict types:

- War.
- Rebellion.
- Feud.
- Trade war.
- Religious conflict.
- Criminal turf conflict.

## Aggregate military model

Represent distant forces as companies rather than individual soldiers.

Company state:

- Faction.
- Unit type.
- Headcount.
- Readiness.
- Morale.
- Supply.
- Experience.
- Commander.
- Current location node.
- Movement order.
- Objective.

Battles outside the local simulation resolve through deterministic aggregate combat events using force composition, terrain, supply, morale, leadership, and keyed randomness.

Near the player, selected companies may promote into local squads under Plan 09 and Plan 11.

## Political cadence

Suggested cadence:

- Relationship event application: immediate.
- Policy review: monthly.
- Strategic goals: quarterly.
- War movement: daily or weekly depending on distance.
- Leadership and succession: event-driven.

Do not evaluate every possible faction-target action every tick. Use bounded candidate generation from current goals, nearby graph nodes, active claims, and recent events.

## Configuration

```yaml
simulation:
  factions:
    policyCadenceDays: 30
    goalCadenceDays: 90
    maxGoalsPerFaction: 8
    maxCandidateActionsPerReview: 32
    relationshipMin: -1000
    relationshipMax: 1000
    decisionNoise: 0
    retainDecisionHistory: 50
  conflict:
    movementCadenceHours: 24
    supplyGraceDays: 7
    localPromotionRadiusKm: 3
```

Faction archetypes, policy defaults, and utility weights belong in YAML.

## Implementation phases

### Phase 0 — faction contracts

- Define faction, relationship, claim, agreement, and conflict schemas.
- Add bounded relationship helpers.
- Add deterministic decision scoring tests.
- Add reason-code contracts.

### Phase 1 — state factions

- Create one faction per imported Azgaar state.
- Assign controlled regions and settlements.
- Initialize treasury and policies conservatively.
- Initialize relationships from adjacency, culture, religion, and configured defaults.

### Phase 2 — diplomacy and policies

- Add trade, tariff, border, alliance, and embargo actions.
- Apply actions through commands and events.
- Connect policies to graph access and Plan 05 costs.
- Add agreement lifecycle and breach events.

### Phase 3 — claims and internal factions

- Add claims over regions, routes, resources, and succession.
- Add one merchant guild and one religious institution in the vertical slice.
- Add influence and internal opposition hooks.

### Phase 4 — aggregate conflict

- Add military companies.
- Add mobilization, movement, supply, and aggregate battles.
- Add occupation and war exhaustion.
- Add ceasefire and peace decisions.

### Phase 5 — RPG integration

- Generate contracts from political actions and conflicts.
- Promote relevant companies or leaders near the player.
- Apply assassinations, rescues, sabotage, and negotiations as canonical events.

## Acceptance gates

- Imported states become stable factions with valid territory and settlements.
- Faction decisions are deterministic and include reason contributions.
- Closing a border changes graph access and trade planning.
- Embargoes affect real shipment eligibility.
- A leader death triggers an explicit succession or vacancy process.
- Aggregate conflict changes territory, supply, or policy through events.
- Local player actions update the same faction relationships and conflict state.
- No political decision is based on renderer residency or LLM output.

## Testing

Required suites:

- Relationship bounds and event application.
- Decision tie-breaking.
- Agreement start, expiry, and breach.
- Border policy integration.
- Claim creation and resolution.
- Embargo trade rejection.
- Military supply degradation.
- Aggregate battle replay determinism.
- Save/reload active conflict.
- Local leader death consequence.

## Observability

Expose:

- Faction goals, claims, policies, and resources.
- Relationship dimensions and recent changes.
- Evaluated actions and reason contributions.
- Active agreements and breach conditions.
- Military companies, supply, and objectives.
- Conflicts, war score, exhaustion, and occupation.
- Decision cadence duration and candidate counts.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Opaque or irrational politics | Explicit utility reasons and bounded action catalogue |
| Quadratic faction comparisons | Candidate generation from geography, claims, and recent events |
| Diplomacy detached from economy | Policies modify graph and shipment rules directly |
| Warfare becomes tactical scope explosion | Aggregate companies and battles first |
| LLM prose becomes authority | Structured decisions first; prose only presents them |

## Done definition

Plan 07 is complete when imported states and selected internal factions can form agreements, change policies, make explainable decisions, create conflicts, move aggregate forces, and react persistently to economic conditions and player actions.
