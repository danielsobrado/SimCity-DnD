import { generatedEntityId } from '../model/ids.js';
import { listEntities, getEntity } from '../model/worldState.js';

export function availableQuantity(account, commodityId) {
  const qty = account.data.quantities?.[commodityId] ?? 0;
  const reserved = account.data.reserved?.[commodityId] ?? 0;
  return qty - reserved;
}

export function inventoryMassKg(account, commodities) {
  let mass = 0;
  for (const [commodityId, qty] of Object.entries(account.data.quantities ?? {})) {
    const def = commodities[commodityId];
    if (!def) continue;
    mass += qty * def.unitMassKg;
  }
  return mass;
}

export function createLedger() {
  const entries = [];
  return {
    record(entry) {
      entries.push({
        ...entry,
        id: entry.id ?? `ledger:${entries.length}`,
      });
    },
    list() {
      return entries.map((e) => structuredClone(e));
    },
    totalTransferred(commodityId) {
      return entries
        .filter((e) => e.commodityId === commodityId)
        .reduce((sum, e) => sum + e.quantity, 0);
    },
    clear() {
      entries.length = 0;
    },
  };
}

export function initializeSettlementEconomy(state, definition, settlement, {
  commandId,
  config,
  ordinalBase = 0,
}) {
  const events = [];
  let ordinal = ordinalBase;
  const marketId = generatedEntityId('market', definition.worldId, commandId, ordinal);
  ordinal += 1;
  const inventoryId = generatedEntityId('inventoryAccount', definition.worldId, commandId, ordinal);
  ordinal += 1;
  const treasuryId = generatedEntityId('inventoryAccount', definition.worldId, commandId, ordinal);
  ordinal += 1;
  const farmId = generatedEntityId('facility', definition.worldId, commandId, ordinal);
  ordinal += 1;
  const millId = generatedEntityId('facility', definition.worldId, commandId, ordinal);
  ordinal += 1;

  const startingGrain = Math.max(50, Math.floor((settlement.data.population || 100) / 2));
  const startingFood = Math.max(20, Math.floor((settlement.data.population || 100) / 5));
  const startingCoin = Math.max(100, Math.floor((settlement.data.population || 100)));

  events.push({
    type: 'entity.upserted',
    entityIds: [inventoryId],
    payload: {
      kind: 'inventoryAccount',
      id: inventoryId,
      data: {
        ownerEntityId: settlement.id,
        locationId: settlement.id,
        capacityMassKg: 100000,
        quantities: { grain: startingGrain, food: startingFood, wood: 40 },
        reserved: {},
      },
    },
  });
  events.push({
    type: 'entity.upserted',
    entityIds: [treasuryId],
    payload: {
      kind: 'inventoryAccount',
      id: treasuryId,
      data: {
        ownerEntityId: settlement.id,
        locationId: settlement.id,
        capacityMassKg: 1000,
        quantities: { coin: startingCoin },
        reserved: {},
        accountRole: 'treasury',
      },
    },
  });
  events.push({
    type: 'entity.upserted',
    entityIds: [marketId],
    payload: {
      kind: 'market',
      id: marketId,
      data: {
        settlementId: settlement.id,
        inventoryAccountId: inventoryId,
        treasuryAccountId: treasuryId,
        prices: Object.fromEntries(
          Object.entries(config.commodities).map(([id, def]) => [id, def.baseValue]),
        ),
        lastClearedTick: state.calendar.tick,
      },
    },
  });
  events.push({
    type: 'entity.upserted',
    entityIds: [farmId],
    payload: {
      kind: 'facility',
      id: farmId,
      data: {
        ownerEntityId: settlement.id,
        settlementId: settlement.id,
        recipeId: 'farm_grain',
        level: 1,
        labourAssigned: 5,
        enabled: true,
      },
    },
  });
  events.push({
    type: 'entity.upserted',
    entityIds: [millId],
    payload: {
      kind: 'facility',
      id: millId,
      data: {
        ownerEntityId: settlement.id,
        settlementId: settlement.id,
        recipeId: 'mill_food',
        level: 1,
        labourAssigned: 3,
        enabled: true,
      },
    },
  });
  events.push({
    type: 'entity.patched',
    entityIds: [settlement.id],
    payload: {
      kind: 'settlement',
      id: settlement.id,
      dataPatch: {
        marketId,
        inventoryAccountId: inventoryId,
        treasuryAccountId: treasuryId,
        facilityIds: [farmId, millId],
      },
    },
  });

  return { events, nextOrdinal: ordinal };
}

function canAffordInputs(account, inputs) {
  for (const [commodityId, qty] of Object.entries(inputs)) {
    if (availableQuantity(account, commodityId) < qty) return false;
  }
  return true;
}

function applyDelta(quantities, commodityId, delta) {
  const next = { ...quantities };
  next[commodityId] = (next[commodityId] ?? 0) + delta;
  if (next[commodityId] < 0) {
    throw Object.assign(new Error('negative_inventory'), { code: 'conservation_violation' });
  }
  if (next[commodityId] === 0) delete next[commodityId];
  return next;
}

export function runDailyEconomy(state, definition, config, ledger) {
  const events = [];
  const reasonCodes = [];
  const markets = listEntities(state, 'market', { includeDestroyed: false });
  const facilities = listEntities(state, 'facility', { includeDestroyed: false });
  const recipes = config.recipes;
  const commodities = config.commodities;

  for (const facility of facilities) {
    if (!facility.data.enabled) continue;
    const recipe = recipes[facility.data.recipeId];
    if (!recipe) continue;
    const settlement = getEntity(state, 'settlement', facility.data.settlementId);
    if (!settlement?.data.inventoryAccountId) continue;
    const account = getEntity(state, 'inventoryAccount', settlement.data.inventoryAccountId);
    if (!account) continue;

    const labourOk = (facility.data.labourAssigned ?? 0) >= (recipe.labour ?? 0);
    if (!labourOk) {
      reasonCodes.push({
        code: 'production_blocked_labour',
        facilityId: facility.id,
        settlementId: settlement.id,
      });
      continue;
    }
    if (!canAffordInputs(account, recipe.inputs ?? {})) {
      reasonCodes.push({
        code: 'production_blocked_inputs',
        facilityId: facility.id,
        settlementId: settlement.id,
      });
      continue;
    }

    let quantities = { ...account.data.quantities };
    for (const [commodityId, qty] of Object.entries(recipe.inputs ?? {})) {
      quantities = applyDelta(quantities, commodityId, -qty);
      ledger?.record({
        tick: state.calendar.tick,
        type: 'production_input',
        settlementId: settlement.id,
        facilityId: facility.id,
        commodityId,
        quantity: -qty,
      });
    }
    for (const [commodityId, qty] of Object.entries(recipe.outputs ?? {})) {
      quantities = applyDelta(quantities, commodityId, qty * (facility.data.level ?? 1));
      ledger?.record({
        tick: state.calendar.tick,
        type: 'production_output',
        settlementId: settlement.id,
        facilityId: facility.id,
        commodityId,
        quantity: qty * (facility.data.level ?? 1),
      });
    }
    events.push({
      type: 'entity.patched',
      entityIds: [account.id],
      payload: {
        kind: 'inventoryAccount',
        id: account.id,
        dataPatch: { quantities },
      },
    });
    // Refresh local view for subsequent facilities in same settlement within this pass:
    account.data.quantities = quantities;
  }

  // Consumption + spoilage + prices
  for (const market of markets) {
    const settlement = getEntity(state, 'settlement', market.data.settlementId);
    const account = getEntity(state, 'inventoryAccount', market.data.inventoryAccountId);
    if (!settlement || !account) continue;
    const pop = Math.max(1, settlement.data.population || 1);
    const foodNeed = Math.max(1, Math.ceil(pop / 50));
    let quantities = { ...account.data.quantities };
    const foodAvail = availableQuantity(account, 'food');
    const consumed = Math.min(foodAvail, foodNeed);
    if (consumed > 0) {
      quantities = applyDelta(quantities, 'food', -consumed);
      ledger?.record({
        tick: state.calendar.tick,
        type: 'consumption',
        settlementId: settlement.id,
        commodityId: 'food',
        quantity: -consumed,
      });
    }
    const foodSecurity = foodNeed === 0 ? 1 : consumed / foodNeed;
    if (foodSecurity < 1) {
      reasonCodes.push({
        code: 'food_shortage',
        settlementId: settlement.id,
        foodSecurity,
      });
    }

    if (config.economy.spoilageEnabled) {
      for (const [commodityId, qty] of Object.entries(quantities)) {
        const def = commodities[commodityId];
        if (!def?.spoilagePerDay) continue;
        const spoiled = Math.floor(qty * def.spoilagePerDay);
        if (spoiled > 0) {
          quantities = applyDelta(quantities, commodityId, -spoiled);
          ledger?.record({
            tick: state.calendar.tick,
            type: 'spoilage',
            settlementId: settlement.id,
            commodityId,
            quantity: -spoiled,
          });
        }
      }
    }

    const prices = { ...market.data.prices };
    for (const [commodityId, def] of Object.entries(commodities)) {
      const stock = quantities[commodityId] ?? 0;
      const target = commodityId === 'food' ? foodNeed * 7 : def.baseValue * 10;
      const ratio = target <= 0 ? 1 : target / Math.max(1, stock);
      const elasticity = config.economy.basePriceElasticity ?? 0.5;
      prices[commodityId] = Math.max(0.01, def.baseValue * (1 + elasticity * (ratio - 1)));
    }

    events.push({
      type: 'entity.patched',
      entityIds: [account.id],
      payload: {
        kind: 'inventoryAccount',
        id: account.id,
        dataPatch: { quantities },
      },
    });
    events.push({
      type: 'entity.patched',
      entityIds: [market.id],
      payload: {
        kind: 'market',
        id: market.id,
        dataPatch: {
          prices,
          foodSecurity,
          lastClearedTick: state.calendar.tick,
        },
      },
    });
    account.data.quantities = quantities;
    market.data.prices = prices;
    market.data.foodSecurity = foodSecurity;
  }

  return { events, reasonCodes };
}

export function transferInventory(state, {
  fromAccountId,
  toAccountId,
  commodityId,
  quantity,
  ledger,
  tick,
  reason = 'transfer',
}) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw Object.assign(new Error('invalid_quantity'), { code: 'invalid_quantity' });
  }
  const from = getEntity(state, 'inventoryAccount', fromAccountId);
  const to = getEntity(state, 'inventoryAccount', toAccountId);
  if (!from || !to) {
    throw Object.assign(new Error('missing_account'), { code: 'missing_reference' });
  }
  if (availableQuantity(from, commodityId) < quantity) {
    throw Object.assign(new Error('insufficient_stock'), { code: 'insufficient_stock' });
  }
  const fromQty = applyDelta({ ...from.data.quantities }, commodityId, -quantity);
  const toQty = applyDelta({ ...to.data.quantities }, commodityId, quantity);
  from.data.quantities = fromQty;
  to.data.quantities = toQty;
  ledger?.record({
    tick,
    type: reason,
    fromAccountId,
    toAccountId,
    commodityId,
    quantity,
  });
  return [
    {
      type: 'entity.patched',
      entityIds: [from.id],
      payload: { kind: 'inventoryAccount', id: from.id, dataPatch: { quantities: fromQty } },
    },
    {
      type: 'entity.patched',
      entityIds: [to.id],
      payload: { kind: 'inventoryAccount', id: to.id, dataPatch: { quantities: toQty } },
    },
  ];
}

export function reserveStock(account, commodityId, quantity) {
  const avail = availableQuantity(account, commodityId);
  if (avail < quantity) {
    throw Object.assign(new Error('insufficient_stock'), { code: 'insufficient_stock' });
  }
  const reserved = { ...account.data.reserved, [commodityId]: (account.data.reserved?.[commodityId] ?? 0) + quantity };
  return reserved;
}
