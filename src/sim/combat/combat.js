import { generatedEntityId } from '../model/ids.js';
import { getEntity, listEntities } from '../model/worldState.js';
import { createSeededRng, hashString } from '../util/seededRng.js';

export function createEncounterParty(state, definition, {
  commandId,
  settlementId,
  factionId = null,
  members,
  ordinalBase = 0,
}) {
  const events = [];
  let ordinal = ordinalBase;
  const characterIds = [];

  for (const member of members) {
    const id = generatedEntityId('character', definition.worldId, commandId, ordinal);
    ordinal += 1;
    characterIds.push(id);
    events.push({
      type: 'entity.upserted',
      entityIds: [id],
      payload: {
        kind: 'character',
        id,
        data: {
          personId: id,
          name: member.name,
          speciesId: member.speciesId ?? 'human',
          factionId,
          homeSettlementId: settlementId,
          role: member.role ?? 'soldier',
          level: member.level ?? 1,
          attributes: member.attributes ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          skills: member.skills ?? {},
          equipmentInventoryId: null,
          healthState: {
            hp: member.hp ?? 20,
            maxHp: member.maxHp ?? member.hp ?? 20,
          },
          relationshipState: {},
          tags: member.tags ?? [],
        },
      },
    });
  }

  const partyId = generatedEntityId('party', definition.worldId, commandId, ordinal);
  ordinal += 1;
  events.push({
    type: 'entity.upserted',
    entityIds: [partyId],
    payload: {
      kind: 'party',
      id: partyId,
      data: {
        partyKind: 'encounter',
        settlementId,
        factionId,
        memberCharacterIds: characterIds,
        status: 'active',
      },
    },
  });

  return { events, partyId, characterIds, nextOrdinal: ordinal };
}

export function createLocalActors(characters, encounterId) {
  return characters.map((character, index) => ({
    actorId: `${encounterId}:actor:${index}`,
    characterId: character.id,
    team: character.data.tags?.includes('hostile') ? 'hostile' : 'ally',
    hp: character.data.healthState.hp,
    maxHp: character.data.healthState.maxHp,
    status: 'active',
    conditions: [],
    initiative: character.data.attributes?.dex ?? 10,
    position: { x: index * 2, y: 0, z: 0 },
  })).sort((a, b) => b.initiative - a.initiative || a.actorId.localeCompare(b.actorId));
}

export function runFixedStepCombat(state, definition, {
  encounterId,
  actors,
  maxRounds = 20,
  config,
}) {
  const rng = createSeededRng(hashString(`${definition.seed}:combat:${encounterId}:${state.calendar.tick}`));
  const melee = config.combat?.defaultMeleeDamage ?? 8;
  const ranged = config.combat?.defaultRangedDamage ?? 6;
  const downedThreshold = config.combat?.downedThreshold ?? 0;
  const log = [];
  const working = actors.map((a) => ({ ...a, conditions: [...(a.conditions ?? [])] }));

  for (let round = 1; round <= maxRounds; round += 1) {
    const livingAllies = working.filter((a) => a.status === 'active' && a.team === 'ally');
    const livingHostiles = working.filter((a) => a.status === 'active' && a.team === 'hostile');
    if (livingAllies.length === 0 || livingHostiles.length === 0) break;

    const order = [...working]
      .filter((a) => a.status === 'active')
      .sort((a, b) => b.initiative - a.initiative || a.actorId.localeCompare(b.actorId));

    for (const actor of order) {
      if (actor.status !== 'active') continue;
      const enemies = working.filter(
        (a) => a.status === 'active' && a.team !== actor.team,
      );
      if (enemies.length === 0) break;
      enemies.sort((a, b) => a.hp - b.hp || a.actorId.localeCompare(b.actorId));
      const target = enemies[0];
      const useRanged = rng.nextFloat() < 0.35;
      const base = useRanged ? ranged : melee;
      const variance = rng.nextInt(0, 3);
      const damage = Math.max(1, base + variance - 1);
      target.hp -= damage;
      log.push({
        round,
        actorId: actor.actorId,
        targetId: target.actorId,
        attack: useRanged ? 'ranged' : 'melee',
        damage,
        remainingHp: target.hp,
      });
      if (target.hp <= downedThreshold) {
        target.hp = 0;
        target.status = 'downed';
        log.push({ round, actorId: target.actorId, event: 'downed' });
      }
    }
  }

  const alliesAlive = working.some((a) => a.team === 'ally' && a.status === 'active');
  const hostilesAlive = working.some((a) => a.team === 'hostile' && a.status === 'active');
  let result = 'ongoing';
  if (!hostilesAlive && alliesAlive) result = 'victory';
  else if (!alliesAlive) result = 'defeat';

  const events = [];
  for (const actor of working) {
    const character = getEntity(state, 'character', actor.characterId);
    if (!character) continue;
    events.push({
      type: 'entity.patched',
      entityIds: [character.id],
      payload: {
        kind: 'character',
        id: character.id,
        dataPatch: {
          healthState: {
            hp: actor.hp,
            maxHp: actor.maxHp,
            status: actor.status,
          },
        },
      },
    });
  }

  return {
    result,
    actors: working,
    log,
    events,
    reasonCodes: [{ code: `combat_${result}`, encounterId }],
  };
}

export function reconcileLoot(state, {
  fromCharacterId,
  toInventoryId,
  quantities,
}) {
  const character = getEntity(state, 'character', fromCharacterId);
  const inventory = getEntity(state, 'inventoryAccount', toInventoryId);
  if (!character || !inventory) {
    throw Object.assign(new Error('missing_loot_target'), { code: 'missing_reference' });
  }
  const nextQty = { ...inventory.data.quantities };
  for (const [commodityId, qty] of Object.entries(quantities)) {
    nextQty[commodityId] = (nextQty[commodityId] ?? 0) + qty;
  }
  return {
    events: [{
      type: 'entity.patched',
      entityIds: [toInventoryId],
      payload: {
        kind: 'inventoryAccount',
        id: toInventoryId,
        dataPatch: { quantities: nextQty },
      },
    }],
    reasonCodes: [{ code: 'loot_reconciled', fromCharacterId, toInventoryId, quantities }],
  };
}

export function createEncounterSite(state, definition, {
  commandId,
  settlementId,
  danger = 0.8,
  ordinal = 0,
}) {
  const id = generatedEntityId('encounterSite', definition.worldId, commandId, ordinal);
  return {
    encounterSiteId: id,
    events: [{
      type: 'entity.upserted',
      entityIds: [id],
      payload: {
        kind: 'encounterSite',
        id,
        data: {
          settlementId,
          encounterKind: 'bandits',
          danger,
          status: 'active',
          reasonCodes: ['route_danger'],
        },
      },
    }],
  };
}

export function listActiveCharacters(state) {
  return listEntities(state, 'character', { includeDestroyed: false });
}
