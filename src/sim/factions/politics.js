import { generatedEntityId } from '../model/ids.js';
import { listEntities, getEntity } from '../model/worldState.js';
import { createSeededRng, hashString } from '../util/seededRng.js';

export function initializeFactionsFromRegions(state, definition, { commandId, ordinalBase = 0 } = {}) {
  const events = [];
  let ordinal = ordinalBase;
  const states = listEntities(state, 'region', { includeDestroyed: false })
    .filter((r) => r.data.regionType === 'state');

  for (const region of states) {
    const factionId = generatedEntityId('faction', definition.worldId, commandId, ordinal);
    ordinal += 1;
    const settlements = listEntities(state, 'settlement', { includeDestroyed: false })
      .filter((s) => s.data.stateId === region.id)
      .map((s) => s.id)
      .sort();
    events.push({
      type: 'entity.upserted',
      entityIds: [factionId],
      payload: {
        kind: 'faction',
        id: factionId,
        data: {
          type: 'state',
          name: region.data.name,
          homeRegionId: region.id,
          controlledRegionIds: [region.id],
          influencedSettlementIds: settlements,
          leaderPersonId: null,
          memberPopulationRefs: [],
          treasuryAccountId: null,
          militaryCompanyIds: [],
          policies: {
            trade: 'open',
            borders: 'controlled',
            taxation: 'normal',
            religion: 'tolerant',
            military: 'defensive',
          },
          goals: [
            { id: 'secure_food', weight: 1, reasonCodes: ['default_goal'] },
            { id: 'secure_borders', weight: 0.8, reasonCodes: ['default_goal'] },
          ],
          claims: [],
          relationships: {},
          legitimacy: 0.7,
          cohesion: 0.7,
          riskTolerance: 0.4,
        },
      },
    });
    events.push({
      type: 'entity.patched',
      entityIds: [region.id],
      payload: {
        kind: 'region',
        id: region.id,
        dataPatch: { factionId },
      },
    });
  }

  return { events, nextOrdinal: ordinal, reasonCodes: [{ code: 'factions_initialized', count: states.length }] };
}

export function setFactionRelationship(state, factionAId, factionBId, dimensions) {
  const a = getEntity(state, 'faction', factionAId);
  const b = getEntity(state, 'faction', factionBId);
  if (!a || !b) {
    throw Object.assign(new Error('missing_faction'), { code: 'missing_reference' });
  }
  const rel = {
    trust: 0,
    fear: 0,
    trade: 0,
    hostility: 0,
    ...dimensions,
  };
  return {
    events: [
      {
        type: 'entity.patched',
        entityIds: [factionAId],
        payload: {
          kind: 'faction',
          id: factionAId,
          dataPatch: {
            relationships: {
              ...(a.data.relationships ?? {}),
              [factionBId]: rel,
            },
          },
        },
      },
      {
        type: 'entity.patched',
        entityIds: [factionBId],
        payload: {
          kind: 'faction',
          id: factionBId,
          dataPatch: {
            relationships: {
              ...(b.data.relationships ?? {}),
              [factionAId]: { ...rel },
            },
          },
        },
      },
    ],
    reasonCodes: [{ code: 'relationship_updated', factionAId, factionBId, ...rel }],
  };
}

export function evaluateFactionDecisions(state, definition) {
  const events = [];
  const reasonCodes = [];
  const rng = createSeededRng(hashString(`${definition.seed}:faction:${state.calendar.tick}`));

  for (const faction of listEntities(state, 'faction', { includeDestroyed: false })) {
    const settlements = (faction.data.influencedSettlementIds ?? [])
      .map((id) => getEntity(state, 'settlement', id))
      .filter(Boolean);
    let foodPressure = 0;
    for (const s of settlements) {
      foodPressure += s.data.social?.foodPressure ?? 0;
    }
    foodPressure = settlements.length ? foodPressure / settlements.length : 0;

    const utilities = [
      {
        action: 'secure_food_trade',
        utility: foodPressure * 2 + (faction.data.goals?.find((g) => g.id === 'secure_food')?.weight ?? 0),
        reasonCodes: ['food_pressure', 'goal_secure_food'],
      },
      {
        action: 'raise_unrest_response',
        utility: settlements.reduce((n, s) => n + (s.data.social?.unrest ?? 0), 0),
        reasonCodes: ['unrest'],
      },
      {
        action: 'maintain_status_quo',
        utility: 0.5 + rng.nextFloat() * 0.1,
        reasonCodes: ['status_quo'],
      },
    ].sort((a, b) => b.utility - a.utility || a.action.localeCompare(b.action));

    const chosen = utilities[0];
    reasonCodes.push({
      code: 'faction_decision',
      factionId: faction.id,
      action: chosen.action,
      utility: chosen.utility,
      reasons: chosen.reasonCodes,
    });
    events.push({
      type: 'entity.patched',
      entityIds: [faction.id],
      payload: {
        kind: 'faction',
        id: faction.id,
        dataPatch: {
          lastDecision: {
            tick: state.calendar.tick,
            action: chosen.action,
            utility: chosen.utility,
            reasonCodes: chosen.reasonCodes,
          },
        },
      },
    });
  }

  return { events, reasonCodes };
}

export function declareConflict(state, definition, {
  commandId,
  type = 'feud',
  factionIds,
  regionIds = [],
  ordinal = 0,
}) {
  const id = generatedEntityId('conflict', definition.worldId, commandId, ordinal);
  return {
    conflictId: id,
    events: [{
      type: 'entity.upserted',
      entityIds: [id],
      payload: {
        kind: 'conflict',
        id,
        data: {
          conflictType: type,
          factionIds: [...factionIds].sort(),
          regionIds: [...regionIds].sort(),
          intensity: 0.3,
          status: 'active',
          startedAtTick: state.calendar.tick,
        },
      },
    }],
    reasonCodes: [{ code: 'conflict_declared', conflictId: id, type, factionIds }],
  };
}

export function setFactionEmbargo(state, factionId, againstFactionId, enabled = true) {
  const faction = getEntity(state, 'faction', factionId);
  if (!faction) {
    throw Object.assign(new Error('missing_faction'), { code: 'missing_reference' });
  }
  const embargoes = { ...(faction.data.embargoes ?? {}) };
  if (enabled) embargoes[againstFactionId] = true;
  else delete embargoes[againstFactionId];
  return {
    events: [{
      type: 'entity.patched',
      entityIds: [factionId],
      payload: {
        kind: 'faction',
        id: factionId,
        dataPatch: {
          embargoes,
          policies: {
            ...(faction.data.policies ?? {}),
            trade: enabled ? 'embargo' : 'open',
          },
        },
      },
    }],
    reasonCodes: [{
      code: enabled ? 'embargo_declared' : 'embargo_lifted',
      factionId,
      againstFactionId,
    }],
  };
}

export function isShipmentEmbargoed(state, originSettlementId, destinationSettlementId) {
  const origin = getEntity(state, 'settlement', originSettlementId);
  const dest = getEntity(state, 'settlement', destinationSettlementId);
  if (!origin || !dest) return false;
  const originFaction = listEntities(state, 'faction', { includeDestroyed: false })
    .find((f) => f.data.homeRegionId === origin.data.stateId);
  const destFaction = listEntities(state, 'faction', { includeDestroyed: false })
    .find((f) => f.data.homeRegionId === dest.data.stateId);
  if (!originFaction || !destFaction) return false;
  if (originFaction.id === destFaction.id) return false;
  return !!(originFaction.data.embargoes?.[destFaction.id]
    || destFaction.data.embargoes?.[originFaction.id]);
}

export function handleLeaderDeath(state, definition, {
  commandId,
  factionId,
  ordinal = 0,
}) {
  const faction = getEntity(state, 'faction', factionId);
  if (!faction) {
    throw Object.assign(new Error('missing_faction'), { code: 'missing_reference' });
  }
  const successorId = generatedEntityId('character', definition.worldId, commandId, ordinal);
  return {
    successorId,
    events: [
      {
        type: 'entity.upserted',
        entityIds: [successorId],
        payload: {
          kind: 'character',
          id: successorId,
          data: {
            personId: successorId,
            name: `Successor of ${faction.data.name}`,
            speciesId: 'human',
            factionId,
            homeSettlementId: faction.data.influencedSettlementIds?.[0] ?? null,
            role: 'noble',
            level: 2,
            attributes: { str: 10, dex: 10, con: 10, int: 12, wis: 11, cha: 14 },
            skills: {},
            equipmentInventoryId: null,
            healthState: { hp: 25, maxHp: 25 },
            relationshipState: {},
            tags: ['leader', 'successor'],
          },
        },
      },
      {
        type: 'entity.patched',
        entityIds: [factionId],
        payload: {
          kind: 'faction',
          id: factionId,
          dataPatch: {
            leaderPersonId: successorId,
            succession: {
              tick: state.calendar.tick,
              previousLeaderId: faction.data.leaderPersonId,
              reasonCodes: ['leader_death'],
            },
          },
        },
      },
    ],
    reasonCodes: [{ code: 'succession_completed', factionId, successorId }],
  };
}

export function createMilitaryCompany(state, definition, {
  commandId,
  factionId,
  strength = 50,
  ordinal = 0,
}) {
  const id = generatedEntityId('militaryCompany', definition.worldId, commandId, ordinal);
  return {
    companyId: id,
    events: [{
      type: 'entity.upserted',
      entityIds: [id],
      payload: {
        kind: 'militaryCompany',
        id,
        data: {
          factionId,
          strength,
          status: 'active',
          locationRegionId: getEntity(state, 'faction', factionId)?.data.homeRegionId ?? null,
        },
      },
    }],
    reasonCodes: [{ code: 'military_company_created', companyId: id, factionId }],
  };
}
