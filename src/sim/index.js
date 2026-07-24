import { createCommandEnvelope } from './commands/commandEnvelope.js';
import { createCommandDispatcher, registerCommandHandler } from './commands/dispatcher.js';
import './events/reducers.js';
import { mergeSimulationConfig } from './config/defaultSimulationConfig.js';
import { projectAzgaarWorld } from './import/projectAzgaarWorld.js';
import { createWorldQueries, checksumWorldState } from './queries/worldQueries.js';
import { validateWorldState } from './model/validation/validateWorldState.js';
import {
  buildGeographicGraph,
  findSettlementNodeId,
  shortestPath,
  PathCache,
} from './geography/geographicGraph.js';
import {
  createWorldClock,
  createScheduler,
  createFixedStepRunner,
  CADENCES,
  ticksPerDay,
  ticksPerYear,
  calendarFromTick,
} from './time/worldClock.js';
import {
  createLedger,
  initializeSettlementEconomy,
  runDailyEconomy,
} from './economy/stockFlow.js';
import {
  planGrainShipment,
  advanceShipments,
  setRouteDanger,
} from './logistics/shipments.js';
import {
  initializeSettlementPopulation,
  runMonthlyPopulation,
  promoteNamedPerson,
} from './population/cohorts.js';
import {
  initializeFactionsFromRegions,
  evaluateFactionDecisions,
  declareConflict,
  setFactionRelationship,
} from './factions/politics.js';
import {
  detectOpportunities,
  createContractFromOpportunity,
  applyContractOutcome,
  createProseAdapter,
} from './rpg/consequencePipeline.js';
import { createLodController } from './lod/simLod.js';
import {
  serializeWorldSnapshot,
  restoreWorldSnapshot,
  createCommandJournal,
  createEventHistory,
  createInMemorySaveStore,
  createReplayRunner,
  createMigrationRegistry,
  buildDiagnosticReport,
} from './persistence/snapshot.js';
import {
  createEncounterParty,
  createLocalActors,
  runFixedStepCombat,
  createEncounterSite,
} from './combat/combat.js';
import { buildAllOverlays } from './presentation/viewModels.js';
import { listEntities, getEntity, cloneWorldState, createAndPutEntity } from './model/worldState.js';
import { createEntityEnvelope } from './model/entityEnvelope.js';
import { generatedEntityId } from './model/ids.js';

const handlerFlag = { registered: false };

function ensureHandlersRegistered() {
  if (handlerFlag.registered) return;
  handlerFlag.registered = true;

  registerCommandHandler('sim.initializeWorldSystems', (state, command) => {
    const { definition, config } = command.payload.__ctx;
    const events = [];
    let ordinal = 0;
    for (const settlement of listEntities(state, 'settlement', { includeDestroyed: false })) {
      const eco = initializeSettlementEconomy(state, definition, settlement, {
        commandId: command.id,
        config,
        ordinalBase: ordinal,
      });
      events.push(...eco.events);
      ordinal = eco.nextOrdinal;
      const pop = initializeSettlementPopulation(state, definition, settlement, {
        commandId: `${command.id}:pop`,
        ordinalBase: ordinal,
      });
      events.push(...pop.events);
      ordinal = pop.nextOrdinal;
    }
    const factions = initializeFactionsFromRegions(state, definition, {
      commandId: `${command.id}:factions`,
      ordinalBase: 0,
    });
    events.push(...factions.events);
    return events;
  });

  registerCommandHandler('sim.dailyTick', (state, command) => {
    const { definition, config, ledger } = command.payload.__ctx;
    const economy = runDailyEconomy(state, definition, config, ledger);
    const shipments = advanceShipments(state, config);
    command.payload.__result = {
      reasonCodes: [...economy.reasonCodes, ...shipments.reasonCodes],
    };
    return [...economy.events, ...shipments.events];
  });

  registerCommandHandler('sim.monthlyTick', (state, command) => {
    const { definition, config } = command.payload.__ctx;
    const pop = runMonthlyPopulation(state, definition, config);
    const factions = evaluateFactionDecisions(state, definition);
    command.payload.__result = {
      reasonCodes: [...pop.reasonCodes, ...factions.reasonCodes],
    };
    return [...pop.events, ...factions.events];
  });

  registerCommandHandler('sim.planShipment', (state, command) => {
    const { definition, config } = command.payload.__ctx;
    const result = planGrainShipment(state, definition, {
      commandId: command.id,
      originSettlementId: command.payload.originSettlementId,
      destinationSettlementId: command.payload.destinationSettlementId,
      commodityId: command.payload.commodityId ?? 'grain',
      quantity: command.payload.quantity,
      config,
    });
    command.payload.__result = {
      shipmentId: result.shipmentId,
      reasonCodes: result.reasonCodes,
    };
    return result.events;
  });

  registerCommandHandler('sim.setRouteDanger', (state, command) => {
    const result = setRouteDanger(state, command.payload.routeId, command.payload.danger);
    command.payload.__result = { reasonCodes: result.reasonCodes };
    return result.events;
  });

  registerCommandHandler('sim.detectOpportunities', (state, command) => {
    const { definition } = command.payload.__ctx;
    const result = detectOpportunities(state, definition, { commandId: command.id });
    command.payload.__result = { reasonCodes: result.reasonCodes };
    return result.events;
  });

  registerCommandHandler('sim.acceptContract', (state, command) => {
    const { definition } = command.payload.__ctx;
    const result = createContractFromOpportunity(state, definition, {
      commandId: command.id,
      opportunityId: command.payload.opportunityId,
      actorId: command.payload.actorId ?? 'player',
    });
    command.payload.__result = {
      contractId: result.contractId,
      reasonCodes: result.reasonCodes,
    };
    return result.events;
  });

  registerCommandHandler('sim.resolveContract', (state, command) => {
    const result = applyContractOutcome(state, {
      contractId: command.payload.contractId,
      success: command.payload.success !== false,
      outcomeEvents: command.payload.outcomeEvents ?? [],
    });
    command.payload.__result = { reasonCodes: result.reasonCodes };
    return result.events;
  });

  registerCommandHandler('sim.runEncounterCombat', (state, command) => {
    const { definition, config } = command.payload.__ctx;
    const partySetup = createEncounterParty(state, definition, {
      commandId: command.id,
      settlementId: command.payload.settlementId,
      factionId: command.payload.factionId ?? null,
      members: command.payload.members,
    });

    // Materialize characters into working state for combat HP resolution.
    for (const ev of partySetup.events) {
      if (ev.type === 'entity.upserted' && !getEntity(state, ev.payload.kind, ev.payload.id)) {
        createAndPutEntity(state, {
          id: ev.payload.id,
          kind: ev.payload.kind,
          createdAtTick: command.issuedAtTick,
          updatedAtTick: command.issuedAtTick,
          data: ev.payload.data,
          tags: ev.payload.tags ?? [],
        });
      }
    }

    const characters = partySetup.characterIds.map((id) => getEntity(state, 'character', id));
    const actors = createLocalActors(characters, partySetup.partyId);
    const combat = runFixedStepCombat(state, definition, {
      encounterId: partySetup.partyId,
      actors,
      config,
    });

    // Avoid duplicate upserts: return patches only for characters already inserted,
    // and party upsert + character upserts that reducers will skip if we convert
    // character upserts into patches when already present.
    const events = [];
    for (const ev of partySetup.events) {
      if (ev.type === 'entity.upserted' && getEntity(state, ev.payload.kind, ev.payload.id)) {
        // Already materialized — emit patch to sync revision via reducer path by
        // replacing with a no-op skip: only emit party if not conflicting.
        if (ev.payload.kind === 'party') {
          // Remove and re-add via events: delete from map then upsert through events
          state.parties.delete(ev.payload.id);
          events.push(ev);
        } else if (ev.payload.kind === 'character') {
          state.characters.delete(ev.payload.id);
          events.push(ev);
        } else {
          events.push(ev);
        }
      } else {
        events.push(ev);
      }
    }
    events.push(...combat.events);

    command.payload.__result = {
      partyId: partySetup.partyId,
      characterIds: partySetup.characterIds,
      combatResult: combat.result,
      reasonCodes: combat.reasonCodes,
      log: combat.log,
    };
    return events;
  });

  registerCommandHandler('sim.promoteSettlement', (state, command) => {
    const lod = command.payload.__ctx.lod;
    const result = lod.promote(state, command.payload.settlementId, command.payload.tier);
    command.payload.__result = { reasonCodes: result.reasonCodes, manifest: result.manifest };
    return result.events;
  });

  registerCommandHandler('sim.demoteSettlement', (state, command) => {
    const lod = command.payload.__ctx.lod;
    const result = lod.demote(state, command.payload.settlementId, command.payload.tier);
    command.payload.__result = { reasonCodes: result.reasonCodes, conserved: result.conserved };
    return result.events;
  });

  registerCommandHandler('sim.declareConflict', (state, command) => {
    const { definition } = command.payload.__ctx;
    const result = declareConflict(state, definition, {
      commandId: command.id,
      type: command.payload.type,
      factionIds: command.payload.factionIds,
      regionIds: command.payload.regionIds ?? [],
    });
    command.payload.__result = { conflictId: result.conflictId, reasonCodes: result.reasonCodes };
    return result.events;
  });

  registerCommandHandler('sim.promotePerson', (state, command) => {
    const { definition } = command.payload.__ctx;
    const result = promoteNamedPerson(state, definition, {
      commandId: command.id,
      settlementId: command.payload.settlementId,
      name: command.payload.name,
      role: command.payload.role,
      factionId: command.payload.factionId ?? null,
    });
    command.payload.__result = { characterId: result.characterId, reasonCodes: result.reasonCodes };
    return result.events;
  });

  registerCommandHandler('sim.createEncounterSite', (state, command) => {
    const { definition } = command.payload.__ctx;
    const result = createEncounterSite(state, definition, {
      commandId: command.id,
      settlementId: command.payload.settlementId,
      danger: command.payload.danger ?? 0.8,
    });
    command.payload.__result = { encounterSiteId: result.encounterSiteId };
    return result.events;
  });

  registerCommandHandler('sim.patchFactionRelationship', (state, command) => {
    const result = setFactionRelationship(
      state,
      command.payload.factionAId,
      command.payload.factionBId,
      command.payload.dimensions ?? {},
    );
    command.payload.__result = { reasonCodes: result.reasonCodes };
    return result.events;
  });
}

export function createSimulationWorld({
  campaign,
  config: partialConfig = {},
  worldId = null,
} = {}) {
  ensureHandlersRegistered();

  const config = mergeSimulationConfig(partialConfig);
  const projected = projectAzgaarWorld(campaign, {
    worldId,
    schemaVersion: config.schemaVersion,
    simulationConfig: config,
  });

  let definition = projected.definition;
  let state = projected.state;
  const ledger = createLedger();
  const journal = createCommandJournal();
  const eventHistory = createEventHistory();
  const pathCache = new PathCache(config.geography.pathCacheEntries);
  const lod = createLodController(config);
  const saveStore = createInMemorySaveStore();
  const migrations = createMigrationRegistry();
  const reasonLog = [];
  let commandSeq = 0;

  const clock = createWorldClock(config.time, state.calendar.tick);
  const scheduler = createScheduler(clock);
  const dispatcher = createCommandDispatcher({
    onAccepted(command, events) {
      journal.append(command);
      for (const event of events) {
        eventHistory.append(event, { important: true });
      }
    },
  });
  const replayRunner = createReplayRunner({ dispatcher });

  scheduler.registerSystem({
    id: 'economy.daily',
    cadence: CADENCES.day,
    catchUp: 'exact',
  });
  scheduler.registerSystem({
    id: 'population.monthly',
    cadence: CADENCES.month,
    catchUp: 'aggregate',
  });

  function ctx() {
    return { definition, config, ledger, lod };
  }

  function nextCommandId(prefix) {
    commandSeq += 1;
    return `${prefix}:${definition.worldId}:${commandSeq}`;
  }

  function dispatch(type, payload = {}) {
    const envelope = createCommandEnvelope({
      id: nextCommandId(type),
      type,
      issuedAtTick: clock.getTick(),
      actorId: payload.actorId ?? 'system',
      expectedWorldRevision: null,
      payload,
      source: payload.source ?? 'system',
    });
    const result = dispatcher.dispatch(state, envelope, ctx());
    if (result.ok) {
      state = result.state;
      state.calendar = calendarFromTick(clock.getTick(), clock.getConfig());
      if (result.result?.reasonCodes) {
        reasonLog.push(...result.result.reasonCodes);
      }
    }
    return {
      ...result,
      command: envelope,
    };
  }

  const runner = createFixedStepRunner({
    clock,
    scheduler,
    calendarConfig: config.time,
    onCadence(event) {
      if (event.cadence === CADENCES.day) {
        dispatch('sim.dailyTick', {});
      }
      if (event.cadence === CADENCES.month) {
        dispatch('sim.monthlyTick', {});
      }
    },
  });

  return {
    get definition() { return definition; },
    get state() { return state; },
    get config() { return config; },
    get clock() { return clock; },
    get scheduler() { return scheduler; },
    get ledger() { return ledger; },
    get lod() { return lod; },
    get reasonLog() { return reasonLog; },
    get proseAdapter() { return createProseAdapter(); },

    queries() {
      return createWorldQueries(definition, state);
    },

    validate() {
      return validateWorldState(state);
    },

    checksum() {
      return checksumWorldState(state);
    },

    dispatch,

    buildGraph() {
      const working = cloneWorldState(state);
      const summary = buildGeographicGraph(working, definition, {
        commandId: nextCommandId('graph'),
        config,
      });
      working.revision = state.revision + 1;
      state = working;
      return { ok: true, ...summary };
    },

    initializeSystems() {
      return dispatch('sim.initializeWorldSystems', {});
    },

    stepDays(days = 1) {
      const dayTicks = ticksPerDay(clock.getConfig());
      return runner.stepTicks(dayTicks * days, {});
    },

    stepMonths(months = 1) {
      return this.stepDays(months * (clock.getConfig().daysPerMonth));
    },

    stepTicks(ticks = 1) {
      return runner.stepTicks(ticks, {});
    },

    pause() { clock.pause(); },
    resume() { clock.resume(); },

    planShipment(payload) {
      return dispatch('sim.planShipment', payload);
    },

    setRouteDanger(routeId, danger) {
      return dispatch('sim.setRouteDanger', { routeId, danger });
    },

    detectOpportunities() {
      return dispatch('sim.detectOpportunities', {});
    },

    acceptContract(opportunityId, actorId = 'player') {
      return dispatch('sim.acceptContract', { opportunityId, actorId });
    },

    resolveContract(contractId, success = true) {
      return dispatch('sim.resolveContract', { contractId, success });
    },

    runEncounterCombat(payload) {
      return dispatch('sim.runEncounterCombat', payload);
    },

    promoteSettlement(settlementId, tier = 'C') {
      return dispatch('sim.promoteSettlement', { settlementId, tier });
    },

    demoteSettlement(settlementId, tier = 'A') {
      return dispatch('sim.demoteSettlement', { settlementId, tier });
    },

    declareConflict(payload) {
      return dispatch('sim.declareConflict', payload);
    },

    promotePerson(payload) {
      return dispatch('sim.promotePerson', payload);
    },

    createEncounterSite(payload) {
      return dispatch('sim.createEncounterSite', payload);
    },

    setFactionRelationship(factionAId, factionBId, dimensions) {
      return dispatch('sim.patchFactionRelationship', {
        factionAId,
        factionBId,
        dimensions,
      });
    },

    findPath(fromSettlementId, toSettlementId) {
      const from = findSettlementNodeId(state, fromSettlementId);
      const to = findSettlementNodeId(state, toSettlementId);
      if (!from || !to) return { ok: false, code: 'missing_nodes' };
      const cached = pathCache.get(from, to);
      if (cached) return cached;
      const path = shortestPath(state, from, to, {
        dangerWeight: config.geography.dangerWeight,
        tollWeight: config.geography.tollWeight,
      });
      pathCache.set(from, to, path);
      return path;
    },

    snapshot() {
      return serializeWorldSnapshot({
        definition,
        state,
        commandRange: { count: journal.list().length },
      });
    },

    async save(slot = 'default') {
      const snap = this.snapshot();
      return saveStore.save(slot, {
        snapshot: snap,
        journal: journal.list(),
        lod: lod.serialize(),
        clockTick: clock.getTick(),
      });
    },

    async load(slot = 'default') {
      const loaded = await saveStore.load(slot);
      if (!loaded.ok) return loaded;
      const restored = restoreWorldSnapshot(loaded.payload.snapshot);
      definition = restored.definition;
      state = restored.state;
      clock.setTick(loaded.payload.clockTick ?? state.calendar.tick);
      lod.restore(loaded.payload.lod ?? { ownership: [], manifests: [] });
      journal.clear();
      for (const cmd of loaded.payload.journal ?? []) journal.append(cmd);
      return { ok: true, checksum: restored.checksum };
    },

    replayFromSnapshot(snapshot, commands) {
      const restored = restoreWorldSnapshot(snapshot);
      let current = restored.state;
      const applied = [];
      for (const command of commands) {
        const result = dispatcher.dispatch(current, command, {
          definition: restored.definition,
          config,
          ledger,
          lod,
        });
        if (!result.ok) {
          return { ok: false, code: result.code, applied, state: current };
        }
        current = result.state;
        applied.push(command.id);
      }
      definition = restored.definition;
      state = current;
      clock.setTick(state.calendar.tick);
      return { ok: true, code: 'ok', applied, state, definition };
    },

    getJournal() {
      return journal.list();
    },

    diagnosticReport() {
      return buildDiagnosticReport({
        definition,
        state,
        queries: createWorldQueries(definition, state),
      });
    },

    presentation() {
      return buildAllOverlays(createWorldQueries(definition, state), {
        reasonCodes: reasonLog,
        clock,
        report: this.diagnosticReport(),
      });
    },

    soakYear() {
      const beforeEntities = createWorldQueries(definition, state).countByKind();
      const days = ticksPerYear(clock.getConfig()) / ticksPerDay(clock.getConfig());
      this.stepDays(days);
      const afterEntities = createWorldQueries(definition, state).countByKind();
      return {
        beforeEntities,
        afterEntities,
        tick: clock.getTick(),
        checksum: this.checksum(),
      };
    },

    migrations,
    saveStore,
  };
}

export function createMiniCampaignFixture() {
  return {
    source: {
      type: 'azgaar-campaign-fixture',
      version: 'test',
      mapId: 'slice-world',
      mapName: 'Vertical Slice',
      seed: 'slice-seed-1',
      sourceWidth: 1000,
      sourceHeight: 800,
    },
    states: [{ i: 1, name: 'Northreach', color: '#336699' }],
    provinces: [
      { i: 1, name: 'Harbor Vale', state: 1 },
      { i: 2, name: 'Inland March', state: 1 },
    ],
    cultures: [{ i: 1, name: 'Riverfolk' }],
    religions: [{ i: 1, name: 'Old Light' }],
    burgs: [
      { i: 1, name: 'Harborwatch', x: 200, y: 200, state: 1, province: 1, capital: true, population: 400 },
      { i: 2, name: 'Millford', x: 500, y: 220, state: 1, province: 1, population: 250 },
      { i: 3, name: 'Stonegate', x: 800, y: 240, state: 1, province: 2, population: 300 },
    ],
    routes: [
      {
        i: 1,
        group: 'roads',
        points: [[200, 200], [500, 220]],
      },
      {
        i: 2,
        group: 'roads',
        points: [[500, 220], [800, 240]],
      },
    ],
    rivers: [],
  };
}

export {
  projectAzgaarWorld,
  mergeSimulationConfig,
  createCommandEnvelope,
  checksumWorldState,
  serializeWorldSnapshot,
  restoreWorldSnapshot,
  validateWorldState,
  buildAllOverlays,
  createEntityEnvelope,
  generatedEntityId,
  CADENCES,
  ticksPerDay,
  ticksPerYear,
  createWorldQueries,
};
