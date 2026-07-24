# Plan 11 — Combat and NPC systems

Status: Proposed  
Priority: 11  
Depends on: Plans 1, 3, 6, 7, 8, 9, and 10  
Blocks: complete playable RPG encounters

## Goal

Create a bounded local RPG simulation for the player, persistent named characters, promoted guards, monsters, merchants, and encounter actors.

Combat and NPC behaviour must be deterministic enough for replay, data-driven enough to expand safely, and connected to canonical population, faction, shipment, contract, and encounter state.

## Current foundation

The project already provides first-person movement, streamed terrain, floating origin, local object placement, voxel rendering, and a local content provider boundary. Player grounding currently uses the CPU heightfield; GPU-only caves and added voxel surfaces do not yet provide player collision.

The first combat slice should therefore target heightfield-supported outdoor encounters. Voxel cave combat waits for an authoritative collision solution rather than reading back GPU marching-cubes geometry.

## Scope

Implement:

- Canonical character and creature identities.
- Local actor projections for Tier C.
- Attributes, resources, equipment, conditions, and abilities.
- Fixed-step combat action processing.
- Melee, ranged, and minimal spell/projectile support.
- Damage, armour, resistance, healing, downed, death, flee, and surrender.
- Perception, targeting, navigation, and bounded NPC decision-making.
- Faction allegiance and hostility.
- Loot and cargo reconciliation.
- Persistent named NPC state.
- Aggregate-party promotion and demotion.
- Outdoor caravan or route-danger vertical-slice encounter.

## Non-goals

- Large class and spell catalogues.
- Complex tactical warfare.
- Global individual NPC simulation.
- Fully destructible combat environments.
- Voxel cave collision before authoritative support exists.
- LLM-controlled combat decisions.
- Cinematic animation systems before combat correctness.

## Character authority

A persistent character belongs to canonical simulation state:

```js
{
  id,
  personId,
  name,
  speciesId,
  factionId,
  homeSettlementId,
  role,
  level,
  attributes,
  skills,
  equipmentInventoryId,
  healthState,
  relationshipState,
  tags,
  status,
  revision
}
```

Tier C actors reference a character ID or an aggregate source binding. Local transform, animation, perception cache, and path state are local representation data, not canonical person identity.

Disposable promoted actors receive deterministic IDs tied to the promotion transaction so replay and demotion remain stable.

## Actor state

```js
{
  actorId,
  canonicalEntityId,
  position,
  velocity,
  facing,
  health,
  stamina,
  mana,
  currentAction,
  conditions,
  targetActorId,
  navigationState,
  perceptionState,
  combatState,
  revision
}
```

Positions use local floating-origin coordinates with an explicit canonical-position conversion owned by the local world boundary.

## Attribute model

Begin with a compact model:

- Might.
- Agility.
- Endurance.
- Intellect.
- Will.
- Perception.

Derived values:

- Maximum health.
- Stamina.
- Mana where applicable.
- Movement speed.
- Accuracy.
- Evasion.
- Armour effectiveness.
- Carry capacity.

All formulas belong in configuration or small data-driven registries. Avoid deep inheritance trees for classes or species.

## Ability definitions

```yaml
abilities:
  basic_sword_attack:
    actionType: melee
    windupMs: 250
    recoveryMs: 400
    staminaCost: 8
    rangeMeters: 2.2
    targeting: hostile_actor
    effects:
      - type: physical_damage
        power: 10
  shortbow_shot:
    actionType: projectile
    windupMs: 450
    recoveryMs: 500
    staminaCost: 6
    rangeMeters: 35
    projectile: arrow_basic
```

Abilities define validated effects. Presentation selects animation, sound, particles, and camera response separately.

## Combat command pipeline

```text
player or NPC intent
→ combat command
→ validate actor state, target, range, resources, cooldown, and line of sight
→ schedule action phases
→ resolve hit or effect using deterministic keyed randomness
→ emit damage, condition, death, flee, or surrender events
→ update contract and world bindings
```

Combat commands include expected actor revision where stale input could create duplicated actions.

## Fixed-step timing

Combat uses the deterministic local fixed step from Plan 03. Authoritative action timing is measured in integer simulation substeps or integer milliseconds mapped to fixed steps.

Animation interpolation may use render time but cannot decide whether an attack lands.

## Damage model

Start simple and explainable:

```text
raw damage
× resistance multiplier
- armour reduction
= final damage
```

Damage types:

- Physical.
- Fire.
- Cold.
- Lightning.
- Poison.
- Arcane.

Clamp and quantize final values. Record a damage breakdown for debugging.

Conditions:

- Bleeding.
- Burning.
- Poisoned.
- Stunned.
- Slowed.
- Frightened.
- Guarding.
- Downed.

Each condition defines stack policy, duration, cadence, and removal rules in YAML.

## Death, defeat, flee, and surrender

Not every encounter should end with all actors dead.

Decision factors:

- Morale.
- Faction doctrine.
- Leader status.
- Casualty ratio.
- Objective status.
- Escape path.
- Player reputation.

Outcomes map to canonical events:

- Character killed.
- Character wounded.
- Character captured.
- Group routed.
- Shipment seized.
- Encounter cleared.
- Contract failed or succeeded.
- Faction grievance changed.

Persistent named characters are never silently deleted.

## NPC behaviour

Use layered deterministic behaviour rather than one complex AI system.

### High-level state machine

- Idle.
- Travel.
- Work.
- Guard.
- Investigate.
- Combat.
- Flee.
- Surrender.
- Interact.

### Combat utility selector

Candidate actions receive scores from:

- Target threat.
- Distance.
- Health and resources.
- Ability availability.
- Ally status.
- Cover or safety.
- Current objective.
- Morale.

Every selected action records reason contributions in development mode.

### Behaviour restrictions

- Maximum evaluated actions per decision.
- Decision cadence separate from fixed movement update.
- Spatial queries limited to the local active area.
- No unrestricted world searches from each NPC.

## Perception

Perception sources:

- Distance.
- Field of view.
- Line of sight.
- Sound event.
- Damage received.
- Faction knowledge.
- Shared alert from allies.

Use broad-phase spatial hashing for candidate actors, followed by bounded line-of-sight tests. A global octree is not required.

## Navigation

Initial outdoor navigation:

- Heightfield-aware walkability sampling.
- Local obstacle broad phase from placed objects and active actors.
- Short-range path grid or navigation graph.
- Direct steering when unobstructed.
- Stuck detection and bounded replanning.

Keep navigation local to Tier C. Long-distance movement remains on the macro geographic graph.

Voxel cave navigation and collision are a later extension after CPU-authoritative voxel collision data exists.

## Aggregate promotion and demotion

Example caravan escort promotion:

```text
aggregate shipment escort strength 6
→ persistent leader character
→ five generated guards
→ equipment allocation from company template
→ local actors bound to shipment and faction
```

After encounter:

```text
survivors, wounds, cargo, carrier condition, prisoners
→ shipment and company reconciliation
→ population or military totals updated
→ disposable local actors released
→ persistent identities retained
```

## Interaction and dialogue

NPC interactions expose structured options based on:

- Character role.
- Faction relationship.
- Active contract.
- Known rumours.
- Inventory and services.
- Current danger.

Template or LLM-generated dialogue may present these facts. Dialogue cannot grant rewards, change ownership, or complete objectives without a validated command.

## Configuration

```yaml
simulation:
  localRpg:
    fixedStepHz: 30
    npcDecisionHz: 5
    maximumActiveActors: 200
    maximumPerceptionCandidates: 32
    maximumUtilityActions: 12
    localSpatialCellMeters: 8
    maximumPathReplansPerSecond: 20
    downedDurationSeconds: 30
    corpseRetentionSeconds: 120
```

Character archetypes, species, abilities, equipment, damage types, conditions, and AI weights belong in YAML registries.

## Implementation phases

### Phase 0 — actor and ability contracts

- Define character and local actor schemas.
- Define ability and condition registries.
- Add deterministic combat-roll helper.
- Add damage and resource accounting tests.

### Phase 1 — player versus one hostile

- Spawn one bound hostile actor outdoors.
- Add targeting, melee attack, damage, defeat, and loot.
- Resolve encounter state through canonical events.
- Save and reload before and after combat.

### Phase 2 — small group combat

- Add guards, bandits, or monsters.
- Add faction hostility, ally alerts, morale, flee, and surrender.
- Add basic ranged attack.
- Add local spatial hash and perception limits.

### Phase 3 — caravan vertical slice

- Promote shipment escort and danger group.
- Run escort or route-clearing encounter.
- Preserve cargo and survivors.
- Update route danger, contract, shipment, and faction state.

### Phase 4 — persistent NPCs and services

- Add named leaders, merchants, and quest NPCs.
- Add structured interaction options.
- Add persistent wounds, capture, death, and reputation effects.

### Phase 5 — expansion after acceptance

- Add selected spells, creatures, equipment, and encounter archetypes.
- Add animation and audio polish.
- Add authoritative voxel collision before cave combat.

## Acceptance gates

- Combat outcomes replay deterministically from the same commands and keyed random inputs.
- Animation frame rate does not change hit, damage, or condition outcomes.
- A local hostile defeat emits canonical encounter and contract events.
- Caravan promotion and demotion preserve cargo, survivors, health, and persistent identities.
- NPC decision evaluation is bounded and exposes selected-action reasons.
- Global population totals account for promoted or killed characters.
- Local actor counts and spatial-query costs remain bounded.
- Save/reload during an active encounter resumes without duplicated actors or rewards.
- Outdoor combat does not depend on GPU voxel readbacks.

## Testing

Required suites:

- Ability validation and cooldown.
- Damage breakdown.
- Condition stacking and expiry.
- Deterministic hit roll.
- Death, flee, and surrender transitions.
- NPC utility tie-breaking.
- Perception candidate limit.
- Navigation stuck recovery.
- Character promotion/demotion conservation.
- Active encounter save/reload.
- Full caravan vertical-slice replay.

## Observability

Expose:

- Active actors by type and faction.
- Fixed-step backlog.
- NPC decisions and reason contributions.
- Perception candidates and line-of-sight tests.
- Path requests, replans, and failures.
- Combat actions, damage, conditions, defeats, and surrenders.
- Promotion/demotion reconciliation residuals.
- Encounter duration and outcome.
- Actor budget rejections.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Combat scope grows before the simulator loop works | One outdoor vertical slice first |
| NPC AI consumes the frame | Bounded candidates, low decision cadence, local spatial hash |
| Local deaths do not affect macro population | Canonical character bindings and reconciliation |
| Animation becomes authoritative | Fixed-step command resolution |
| Cave combat ships without collision authority | Explicitly defer until CPU-authoritative voxel collision exists |

## Done definition

Plan 11 is complete when the player can resolve a deterministic outdoor caravan or route-danger encounter involving promoted NPCs, and the result correctly updates persistent characters, cargo, population, faction relationships, route danger, shipment state, and contract outcomes.
