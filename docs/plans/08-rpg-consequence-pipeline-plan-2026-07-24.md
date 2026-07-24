# Plan 08 — RPG consequence pipeline

Status: Proposed  
Priority: 8  
Depends on: Plans 1–7  
Blocks: Plans 9, 10, and 11

## Goal

Connect macro simulation problems to discoverable RPG opportunities, local playable encounters, verified outcomes, and persistent world consequences.

The RPG layer must not be a separate quest database pasted onto the simulator. Contracts, rumours, encounters, rewards, failures, and player choices must read from and write to the same authoritative world state used by the economy, logistics, population, geography, and faction systems.

## Scope

Implement:

- Opportunity detection from world-state conditions.
- Structured contracts and objectives.
- Rumours, discovery, and visibility rules.
- Contract offers, acceptance, deadlines, and failure.
- Local encounter binding.
- Outcome verification from canonical events.
- Reward, reputation, economy, route, and political consequences.
- Contract chains and follow-up opportunities.
- Optional LLM presentation boundary with strict structured inputs and outputs.
- Vertical-slice escort or monster-clearing loop.

## Non-goals

- Hand-authoring hundreds of quests.
- LLM ownership of quest state or outcomes.
- Fully procedural dialogue before the structured loop works.
- Large class, spell, or item catalogues.
- Cinematic quest scripting.

## Core pipeline

```text
world pressure or opportunity
→ opportunity detector
→ structured opportunity
→ rumour or direct offer
→ contract
→ accepted objectives
→ local encounter or decision
→ canonical outcome events
→ objective verification
→ rewards and world-state mutations
→ follow-up opportunities
```

Every step has a stable ID and revision.

## Opportunity model

An opportunity is a generated but not yet accepted gameplay possibility.

```js
{
  id,
  type,
  sourceEntityIds,
  targetEntityIds,
  locationNodeId,
  urgency,
  createdAtTick,
  expiresAtTick,
  visibility,
  proposedObjectives,
  proposedConsequences,
  reasonCodes,
  status
}
```

Initial opportunity types:

- Escort shipment.
- Clear dangerous route.
- Recover stolen cargo.
- Defend settlement.
- Investigate missing shipment.
- Repair bridge or route.
- Negotiate border access.
- Deliver medicine or food.
- Rescue named person.
- Hunt monster faction leader.
- Sabotage or protect resource site.
- Mediate faction dispute.

## Opportunity detectors

Detectors run on explicit triggers or bounded cadences.

Examples:

- Shipment becomes blocked or intercepted.
- Route danger exceeds threshold.
- Settlement food security falls below threshold.
- Faction relationship crosses hostility threshold.
- Resource site becomes occupied.
- Population health falls below threshold.
- Military company lacks supplies.
- Named person becomes captured or missing.

A detector emits a structured opportunity with reason codes. It does not directly create UI prose.

## Contract model

```js
{
  id,
  opportunityId,
  issuerFactionId,
  issuerPersonId,
  beneficiaryEntityIds,
  acceptedByPartyId,
  acceptedAtTick,
  deadlineTick,
  status,
  objectives,
  rewards,
  failureEffects,
  visibility,
  encounterBindings,
  revision
}
```

Contract status:

- `offered`
- `accepted`
- `active`
- `succeeded`
- `failed`
- `expired`
- `cancelled`
- `betrayed`

## Objective model

Objectives are machine-verifiable predicates over canonical events and state.

Initial objective types:

- Entity reaches destination.
- Shipment arrives with minimum cargo.
- Route danger reduced below threshold.
- Encounter site cleared.
- Named person survives.
- Item or commodity delivered.
- Agreement signed.
- Region ownership changed.
- Target captured, defeated, or protected.
- Investigation evidence collected.

Objective example:

```js
{
  id,
  type: 'shipment_arrives',
  targetShipmentId,
  minimumCargo: { grain: 30 },
  requiredByTick,
  status,
  progress,
  completionEventId
}
```

Do not mark objectives complete from UI button presses. Completion follows authoritative events.

## Reward and consequence model

Rewards may include:

- Coin transfer.
- Commodity transfer.
- Equipment or item grant.
- Faction relationship changes.
- Legal access or permit.
- Settlement ownership or building rights.
- Information or map reveal.
- Party experience.

Consequences may include:

- Shipment delivery or loss.
- Route safety change.
- Market price change through inventory effects.
- Population health or migration change.
- Faction grievance, trust, fear, or respect change.
- Leader death or succession.
- Conflict escalation or peace.
- New resource access.
- Follow-up contract generation.

Consequences must be expressed as commands and domain events owned by the relevant subsystem.

## Rumours and discovery

The world may contain opportunities the player does not know about.

Visibility sources:

- Physical proximity.
- Settlement notice board.
- Faction relationship.
- Guild membership.
- Tavern or merchant network.
- Witnessed event.
- Purchased information.
- Map marker or note.

Rumour state tracks:

- Source.
- Reliability.
- Age.
- Location accuracy.
- Known facts.
- Expiry.

Rumours may be inaccurate in presentation, but canonical contract objectives remain structured once accepted.

## Local encounter binding

A contract may bind to an existing encounter site or create one.

```text
contract objective
→ encounter binding
→ local content provider request for canonical chunk/location
→ spawn manifest references contract and source entities
→ player resolves local state
→ local systems emit canonical outcome events
→ contract evaluator updates objectives
```

The local encounter manifest must contain stable IDs for:

- Contract.
- Encounter site.
- Shipment or faction source.
- Persistent characters.
- Spawn groups.
- Cargo or objective objects.

The encounter must remain resumable after leaving and returning.

## LLM boundary

LLMs may generate:

- Contract title.
- Briefing prose.
- Dialogue variants.
- Rumour wording.
- Post-event summaries.

LLMs may not decide:

- Whether the opportunity exists.
- Objective conditions.
- Rewards.
- Canonical success or failure.
- Inventory or coin mutations.
- Combat outcomes.
- Relationship values.
- World ownership.

Structured input includes verified facts and allowed tone. Structured output is validated and may be discarded without affecting the simulation.

## Configuration

```yaml
simulation:
  rpg:
    opportunityCadenceHours: 6
    maximumActiveOpportunities: 500
    maximumOffersPerSettlement: 20
    defaultContractDays: 7
    retainCompletedContracts: 2000
    localEncounterRadiusKm: 2
    enableLlmPresentation: false
```

Opportunity templates, reward formulas, and objective definitions belong in YAML registries.

## Implementation phases

### Phase 0 — contracts and evaluators

- Define opportunity, contract, objective, reward, and encounter-binding schemas.
- Implement objective registry.
- Add event-driven objective evaluation.
- Add idempotent completion and reward settlement.

### Phase 1 — blocked shipment vertical slice

- Detect a blocked grain shipment.
- Create route-danger opportunity.
- Offer escort or clear-route contract.
- Accept contract with deadline.
- Bind to one local encounter site.

### Phase 2 — local resolution

- Spawn shipment or danger actors from canonical IDs.
- Resolve encounter through minimal local gameplay.
- Emit route-danger and shipment-state events.
- Verify objective completion.
- Settle reward exactly once.

### Phase 3 — rumours and offers

- Add notice-board offers.
- Add rumour records and discovery.
- Add map and settlement UI queries.
- Add expiry and stale-rumour handling.

### Phase 4 — political and social contracts

- Add negotiation, medicine delivery, rescue, and faction dispute templates.
- Add consequences for relationships, population, and policy.
- Add branching follow-up opportunities from canonical outcomes.

### Phase 5 — presentation layer

- Add deterministic template-based prose.
- Add optional validated LLM wording.
- Add event recap and contract history.

## Acceptance gates

- A blocked shipment creates a structured opportunity with source reasons.
- Accepting a contract creates machine-verifiable objectives and a deadline.
- Local encounter completion updates canonical route and shipment state.
- Market and food-security effects occur through actual cargo arrival.
- Rewards settle once even if completion events are replayed or UI reloads.
- Failure and expiry apply explicit consequences.
- Leaving and re-entering an encounter preserves contract state.
- Disabling the LLM presentation path does not change outcomes.
- A saved and reloaded active contract completes to the same checksum.

## Testing

Required suites:

- Opportunity detector trigger and deduplication.
- Contract acceptance validation.
- Objective event matching.
- Deadline expiry.
- Reward idempotence.
- Encounter binding save/reload.
- Failure consequence application.
- Follow-up opportunity generation.
- LLM output validation and rejection.
- Full vertical-slice replay.

## Observability

Expose:

- Opportunities by type and reason.
- Offers, accepted contracts, successes, failures, and expiries.
- Objective progress and matching events.
- Reward settlement transactions.
- Encounter bindings and local state.
- Opportunity deduplication count.
- Average time from world problem to contract resolution.
- Consequence events by subsystem.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Quest system becomes detached content | Opportunities derive from canonical world state |
| Objectives complete incorrectly | Event-driven typed evaluators |
| Rewards duplicate | Idempotent settlement command |
| LLM invents facts | Structured facts, validation, and presentation-only role |
| Generated content becomes repetitive | Small strong templates first; add variation after systemic breadth exists |

## Done definition

Plan 08 is complete when a real simulation problem can create a discoverable contract, produce a persistent local encounter, verify the player outcome from canonical events, and change economy, routes, population, or faction state without duplicated rewards or separate quest-only authority.
