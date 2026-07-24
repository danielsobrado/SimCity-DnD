# Plan 03 — Deterministic time and scheduler

Status: Proposed  
Priority: 3  
Depends on: Plan 01  
Blocks: Plans 4–10

## Goal

Create one authoritative world clock and deterministic scheduler for real-time local play, accelerated campaign simulation, paused inspection, and bounded catch-up processing.

Simulation results must not depend on render FPS, browser refresh rate, worker completion order, or wall-clock timing.

## Scope

Implement:

- Canonical world calendar and tick representation.
- Fixed-step simulation updates.
- Multiple simulation cadences.
- Deterministic scheduled jobs.
- Pause, step, speed, and run-until controls.
- Bounded catch-up for unloaded or inactive regions.
- Stable job ordering and cancellation.
- Per-system execution budgets and diagnostics.
- Save/reload of pending jobs and clock state.

## Non-goals

- Economy rules.
- NPC behaviour trees.
- Rendering animation time.
- Real-world time synchronization.
- Background execution while the application is closed.

## Time model

Use integer ticks as the canonical time representation.

Recommended initial unit:

```text
1 simulation tick = 1 in-game minute
```

Derived values:

- 60 ticks per hour.
- 1,440 ticks per day.
- Calendar conversion is presentation logic.
- No floating-point timestamps in authoritative state.

The calendar definition should be configurable because fantasy worlds may not use the Gregorian calendar.

```yaml
simulation:
  time:
    ticksPerHour: 60
    hoursPerDay: 24
    daysPerWeek: 7
    daysPerMonth: 30
    monthsPerYear: 12
    initialYear: 1
    initialMonth: 1
    initialDay: 1
    initialHour: 8
```

## Scheduler layers

### Render-adjacent fixed update

Used for:

- Player movement integration boundary.
- Local combat timing.
- Nearby NPC actions.

This may run several times per rendered frame when required, but it remains fixed-step and bounded.

### Hourly simulation

Used for:

- Local settlement queues.
- Nearby travel progress.
- Contract deadlines.
- Health and fatigue updates.

### Daily simulation

Used for:

- Production and consumption.
- Market clearing.
- Shipment progress.
- Taxes and upkeep.
- Population needs.

### Weekly or monthly simulation

Used for:

- Migration.
- Construction progress.
- Political decisions.
- Cultural and religious influence.
- Strategic war planning.

Systems register cadence rather than testing calendar modulo values throughout the codebase.

## Proposed structure

```text
src/sim/time/
├── worldClock.js
├── calendar.js
├── fixedStepRunner.js
├── scheduler.js
├── jobRegistry.js
├── cadenceRegistry.js
├── catchUp.js
├── timeControls.js
└── validation/
```

## Scheduled job contract

```js
{
  id,
  type,
  dueTick,
  priority,
  ownerEntityId,
  payload,
  recurrence,
  createdAtTick,
  cancelledAtTick,
  schemaVersion
}
```

Ordering key:

```text
dueTick → priority → type → ownerEntityId → jobId
```

Never depend on map insertion order or worker completion order.

## System update contract

Each registered system declares:

- Stable system ID.
- Cadence.
- Read set.
- Write command or event types.
- Maximum work units per slice.
- Catch-up strategy.
- Diagnostics label.

A system must emit commands or events rather than directly mutating unrelated subsystem state.

## Catch-up strategies

Different systems require different handling:

### Exact iteration

Run every missed interval. Use for:

- Contract deadlines.
- Construction completion.
- Scheduled political events.
- Shipments close to the player.

### Aggregate catch-up

Compute the effect over a range without iterating every tick. Use for:

- Distant food consumption.
- Population growth.
- Interest or upkeep.
- Long-distance shipment progress.

### Deferred detailed replay

Keep a coarse result and materialize details only when promoted to a higher simulation tier. Use for:

- Distant battles.
- Abstract caravans.
- Background wilderness encounters.

Every system must explicitly choose one strategy.

## Runtime modes

Required controls:

- Pause.
- Resume.
- Step one tick.
- Step one hour.
- Step one day.
- 1× local play.
- Accelerated map simulation.
- Run until a selected scheduled event.
- Run until a condition predicate with a hard safety limit.

Player combat or local danger may automatically cap or pause acceleration through a transparent policy, not hidden UI behaviour.

## Frame integration

The render loop provides elapsed real time to a fixed-step runner. The runner:

1. Clamps pathological elapsed time after tab suspension.
2. Accumulates elapsed time.
3. Runs a bounded number of fixed local steps.
4. Advances campaign ticks according to selected speed.
5. Schedules remaining catch-up work for later frames or a simulation worker.

Do not process an unbounded backlog in one frame.

## Worker boundary

The scheduler should be written so coarse simulation can later move to a module worker. Initial implementation may remain on the main thread if budgets are small, but authoritative inputs and outputs must be serializable.

Worker jobs must return deterministic event batches tagged with:

- Input world revision.
- Start tick.
- End tick.
- System ID.
- Job ID.

Stale results are rejected or recomputed.

## Implementation phases

### Phase 0 — clock contracts

- Implement integer tick utilities.
- Implement calendar conversion.
- Add rollover tests.
- Add configurable calendar validation.
- Add deterministic formatting fixtures.

### Phase 1 — fixed-step runner

- Separate simulation time from render time.
- Add pause and step controls.
- Add elapsed-time clamping.
- Add maximum steps per frame.
- Instrument backlog and dropped presentation time.

### Phase 2 — scheduler

- Implement deterministic priority queue.
- Register job handlers by stable type.
- Add cancellation and recurrence.
- Serialize pending jobs.
- Reject duplicate job IDs.

### Phase 3 — cadence registry

- Add hourly, daily, weekly, and monthly system hooks.
- Replace ad hoc timer logic with registrations.
- Add per-system work-unit budgets.
- Add deterministic update ordering.

### Phase 4 — catch-up

- Implement exact and aggregate catch-up APIs.
- Add region or simulation-tier scoped catch-up.
- Add hard limits and resumable backlog.
- Add long-tab-suspension tests.

### Phase 5 — map controls

- Add pause, speed, step-day, and run-until controls to the campaign map.
- Display current date, speed, backlog, and next important event.
- Prevent accidental acceleration during unsafe local states.

## Acceptance gates

- Running the same commands at 30 FPS and 144 FPS produces the same world checksum.
- Pause prevents authoritative tick advancement.
- Step-day advances exactly one configured day.
- Scheduled jobs with the same due tick execute in stable order.
- Save/reload preserves the clock and pending jobs.
- Catching up one simulated year does not block a single frame for an unbounded duration.
- No system reads `Date.now()` or animation timestamps for authoritative outcomes.
- Tab suspension does not create a catastrophic main-thread catch-up spike.

## Testing

Required tests:

- Calendar rollover across day, month, and year.
- Fixed-step equivalence across frame rates.
- Priority tie-breaking.
- Recurring job rescheduling.
- Cancellation idempotence.
- Save/reload pending jobs.
- Exact versus aggregate catch-up equivalence for supported systems.
- Stale worker result rejection.
- Run-until safety limit.

## Observability

Expose:

- Current tick and formatted date.
- Simulation speed.
- Fixed steps executed per frame.
- Backlog ticks.
- Jobs pending and executed by type.
- Catch-up ranges and durations.
- Per-system update duration and work units.
- Stale job result count.
- Safety-limit abort count.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Accelerated time freezes rendering | Work-unit budgets and resumable catch-up |
| Results differ by frame rate | Integer ticks and fixed-step execution |
| Scheduler becomes a monolith | Registry of small job handlers |
| Worker results overwrite newer state | Input revision checks |
| Calendar assumptions leak into logic | Tick arithmetic as authority; calendar only converts |

## Done definition

Plan 03 is complete when the campaign can pause, step, accelerate, save, reload, and catch up deterministically; scheduled jobs execute in stable order; and equivalent command logs produce identical state across different render frame rates.
