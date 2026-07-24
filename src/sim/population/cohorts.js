import { generatedEntityId } from '../model/ids.js';
import { getEntity, listEntities } from '../model/worldState.js';
import { createSeededRng, hashString } from '../util/seededRng.js';

const AGE_BANDS = Object.freeze(['child', 'working', 'elder']);
const ROLES = Object.freeze([
  'farmers', 'labourers', 'artisans', 'merchants', 'soldiers',
  'clergy', 'scholars', 'nobles', 'unemployed', 'displaced',
]);
const WEALTH_BANDS = Object.freeze(['poor', 'middle', 'wealthy']);

export function initializeSettlementPopulation(state, definition, settlement, {
  commandId,
  ordinalBase = 0,
}) {
  const events = [];
  let ordinal = ordinalBase;
  const total = Math.max(30, Math.floor(settlement.data.population || 100));
  const working = Math.floor(total * 0.6);
  const child = Math.floor(total * 0.25);
  const elder = total - working - child;

  const cohorts = [
    { ageBand: 'child', role: 'unemployed', wealthBand: 'poor', count: child },
    { ageBand: 'working', role: 'farmers', wealthBand: 'middle', count: Math.floor(working * 0.5) },
    { ageBand: 'working', role: 'labourers', wealthBand: 'poor', count: Math.floor(working * 0.3) },
    { ageBand: 'working', role: 'artisans', wealthBand: 'middle', count: Math.floor(working * 0.15) },
    { ageBand: 'working', role: 'soldiers', wealthBand: 'middle', count: Math.max(1, working - Math.floor(working * 0.95)) },
    { ageBand: 'elder', role: 'unemployed', wealthBand: 'poor', count: elder },
  ];

  const cohortIds = [];
  for (const cohort of cohorts) {
    if (cohort.count <= 0) continue;
    const id = generatedEntityId('populationCohort', definition.worldId, commandId, ordinal);
    ordinal += 1;
    cohortIds.push(id);
    events.push({
      type: 'entity.upserted',
      entityIds: [id],
      payload: {
        kind: 'populationCohort',
        id,
        data: {
          settlementId: settlement.id,
          cultureId: null,
          religionId: null,
          ageBand: cohort.ageBand,
          role: cohort.role,
          wealthBand: cohort.wealthBand,
          count: cohort.count,
          health: 1,
          education: cohort.role === 'scholars' ? 0.8 : 0.3,
          loyalty: 0.7,
        },
      },
    });
  }

  events.push({
    type: 'entity.patched',
    entityIds: [settlement.id],
    payload: {
      kind: 'settlement',
      id: settlement.id,
      dataPatch: {
        population: total,
        cohortIds,
        social: {
          happiness: 0.7,
          unrest: 0.1,
          foodPressure: 0,
          migrationPressure: 0,
        },
      },
    },
  });

  return { events, nextOrdinal: ordinal, cohortIds };
}

export function runMonthlyPopulation(state, definition, config) {
  const events = [];
  const reasonCodes = [];
  const rng = createSeededRng(hashString(`${definition.seed}:pop:${state.calendar.tick}`));
  const birthRate = config.population?.birthRatePerMonth ?? 0.002;
  const deathRate = config.population?.deathRatePerMonth ?? 0.0015;
  const migrationThreshold = config.population?.migrationThreshold ?? 0.4;

  for (const settlement of listEntities(state, 'settlement', { includeDestroyed: false })) {
    const market = settlement.data.marketId
      ? getEntity(state, 'market', settlement.data.marketId)
      : null;
    const foodSecurity = market?.data.foodSecurity ?? 1;
    const cohorts = listEntities(state, 'populationCohort', { includeDestroyed: false })
      .filter((c) => c.data.settlementId === settlement.id);

    let total = 0;
    for (const cohort of cohorts) {
      let count = cohort.data.count;
      const births = cohort.data.ageBand === 'working'
        ? Math.floor(count * birthRate * foodSecurity)
        : 0;
      const deaths = Math.floor(count * deathRate * (2 - foodSecurity));
      count = Math.max(0, count + births - deaths);
      total += count;
      events.push({
        type: 'entity.patched',
        entityIds: [cohort.id],
        payload: {
          kind: 'populationCohort',
          id: cohort.id,
          dataPatch: {
            count,
            health: Math.max(0.1, Math.min(1, (cohort.data.health ?? 1) * (0.9 + 0.1 * foodSecurity))),
          },
        },
      });
      if (deaths > 0) {
        reasonCodes.push({ code: 'cohort_deaths', cohortId: cohort.id, deaths });
      }
      if (births > 0) {
        reasonCodes.push({ code: 'cohort_births', cohortId: cohort.id, births });
      }
    }

    const foodPressure = Math.max(0, 1 - foodSecurity);
    const unrest = Math.min(1, (settlement.data.social?.unrest ?? 0.1) * 0.9 + foodPressure * 0.2);
    const migrationPressure = foodPressure > migrationThreshold
      ? foodPressure + rng.nextFloat() * 0.1
      : Math.max(0, (settlement.data.social?.migrationPressure ?? 0) * 0.8);

    if (migrationPressure > migrationThreshold) {
      reasonCodes.push({
        code: 'migration_pressure',
        settlementId: settlement.id,
        migrationPressure,
      });
    }

    events.push({
      type: 'entity.patched',
      entityIds: [settlement.id],
      payload: {
        kind: 'settlement',
        id: settlement.id,
        dataPatch: {
          population: total,
          social: {
            happiness: Math.max(0, Math.min(1, foodSecurity * 0.8 + (1 - unrest) * 0.2)),
            unrest,
            foodPressure,
            migrationPressure,
          },
        },
      },
    });
  }

  return { events, reasonCodes };
}

export function promoteNamedPerson(state, definition, {
  commandId,
  settlementId,
  name,
  role = 'merchant',
  factionId = null,
  ordinal = 0,
}) {
  const id = generatedEntityId('character', definition.worldId, commandId, ordinal);
  return {
    characterId: id,
    events: [{
      type: 'entity.upserted',
      entityIds: [id],
      payload: {
        kind: 'character',
        id,
        data: {
          personId: id,
          name,
          speciesId: 'human',
          factionId,
          homeSettlementId: settlementId,
          role,
          level: 1,
          attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          skills: {},
          equipmentInventoryId: null,
          healthState: { hp: 20, maxHp: 20 },
          relationshipState: {},
          tags: ['named'],
        },
      },
    }],
    reasonCodes: [{ code: 'person_promoted', characterId: id, settlementId }],
  };
}

export { AGE_BANDS, ROLES, WEALTH_BANDS };
