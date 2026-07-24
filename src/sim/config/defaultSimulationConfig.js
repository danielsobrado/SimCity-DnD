export const DEFAULT_SIMULATION_CONFIG = Object.freeze({
  schemaVersion: 1,
  projectionVersion: 1,
  strictValidation: true,
  retainDestroyedEntities: true,
  maxEventsPerTick: 10000,
  kilometersPerUnit: 1,
  time: Object.freeze({
    ticksPerHour: 60,
    hoursPerDay: 24,
    daysPerWeek: 7,
    daysPerMonth: 30,
    monthsPerYear: 12,
    initialYear: 1,
    initialMonth: 1,
    initialDay: 1,
    initialHour: 8,
  }),
  geography: Object.freeze({
    graphVersion: 1,
    roadSpeedKmPerHour: 5,
    trailSpeedKmPerHour: 3,
    riverDownstreamSpeedKmPerHour: 8,
    riverUpstreamSpeedKmPerHour: 3,
    seaSpeedKmPerHour: 12,
    maxGeneratedSeaLaneKm: 400,
    pathCacheEntries: 2048,
    dangerWeight: 1.0,
    tollWeight: 1.0,
  }),
  persistence: Object.freeze({
    snapshotIntervalDays: 30,
    maximumSnapshots: 12,
    maximumCommandsBetweenSnapshots: 100000,
    importantEventRetentionYears: 20,
    recentReducerEventDays: 30,
  }),
  lod: Object.freeze({
    tierBRadiusSettlements: 3,
    tierCRadiusMeters: 500,
    maxPromotionsPerTick: 16,
    maxDemotionsPerTick: 16,
  }),
  combat: Object.freeze({
    ticksPerRound: 6,
    defaultMeleeDamage: 8,
    defaultRangedDamage: 6,
    downedThreshold: 0,
  }),
  economy: Object.freeze({
    basePriceElasticity: 0.5,
    taxRate: 0.1,
    spoilageEnabled: true,
  }),
  population: Object.freeze({
    birthRatePerMonth: 0.002,
    deathRatePerMonth: 0.0015,
    migrationThreshold: 0.4,
  }),
  commodities: Object.freeze({
    grain: Object.freeze({
      category: 'food_input', unitMassKg: 1, baseValue: 1, spoilagePerDay: 0.002, strategic: true,
    }),
    food: Object.freeze({
      category: 'food', unitMassKg: 1, baseValue: 2, spoilagePerDay: 0.01, strategic: true,
    }),
    wood: Object.freeze({
      category: 'raw', unitMassKg: 2, baseValue: 2, spoilagePerDay: 0, strategic: false,
    }),
    stone: Object.freeze({
      category: 'raw', unitMassKg: 5, baseValue: 2, spoilagePerDay: 0, strategic: false,
    }),
    iron_ore: Object.freeze({
      category: 'raw', unitMassKg: 3, baseValue: 4, spoilagePerDay: 0, strategic: true,
    }),
    iron: Object.freeze({
      category: 'manufactured', unitMassKg: 3, baseValue: 10, spoilagePerDay: 0, strategic: true,
    }),
    tools: Object.freeze({
      category: 'manufactured', unitMassKg: 5, baseValue: 25, spoilagePerDay: 0, strategic: true,
    }),
    textiles: Object.freeze({
      category: 'manufactured', unitMassKg: 1, baseValue: 6, spoilagePerDay: 0.001, strategic: false,
    }),
    medicine: Object.freeze({
      category: 'manufactured', unitMassKg: 1, baseValue: 20, spoilagePerDay: 0.005, strategic: true,
    }),
    weapons: Object.freeze({
      category: 'manufactured', unitMassKg: 4, baseValue: 40, spoilagePerDay: 0, strategic: true,
    }),
    livestock: Object.freeze({
      category: 'food_input', unitMassKg: 50, baseValue: 30, spoilagePerDay: 0.001, strategic: false,
    }),
    luxury_goods: Object.freeze({
      category: 'luxury', unitMassKg: 1, baseValue: 50, spoilagePerDay: 0, strategic: false,
    }),
    magical_materials: Object.freeze({
      category: 'magic', unitMassKg: 1, baseValue: 100, spoilagePerDay: 0, strategic: true,
    }),
    coin: Object.freeze({
      category: 'currency', unitMassKg: 0.01, baseValue: 1, spoilagePerDay: 0, strategic: true,
    }),
  }),
  recipes: Object.freeze({
    farm_grain: Object.freeze({
      inputs: Object.freeze({}),
      outputs: Object.freeze({ grain: 20 }),
      labour: 5,
    }),
    mill_food: Object.freeze({
      inputs: Object.freeze({ grain: 10 }),
      outputs: Object.freeze({ food: 8 }),
      labour: 3,
    }),
    lumber: Object.freeze({
      inputs: Object.freeze({}),
      outputs: Object.freeze({ wood: 10 }),
      labour: 4,
    }),
  }),
});

export function mergeSimulationConfig(partial = {}) {
  return {
    ...DEFAULT_SIMULATION_CONFIG,
    ...partial,
    time: { ...DEFAULT_SIMULATION_CONFIG.time, ...(partial.time ?? {}) },
    geography: { ...DEFAULT_SIMULATION_CONFIG.geography, ...(partial.geography ?? {}) },
    persistence: { ...DEFAULT_SIMULATION_CONFIG.persistence, ...(partial.persistence ?? {}) },
    lod: { ...DEFAULT_SIMULATION_CONFIG.lod, ...(partial.lod ?? {}) },
    combat: { ...DEFAULT_SIMULATION_CONFIG.combat, ...(partial.combat ?? {}) },
    economy: { ...DEFAULT_SIMULATION_CONFIG.economy, ...(partial.economy ?? {}) },
    population: { ...DEFAULT_SIMULATION_CONFIG.population, ...(partial.population ?? {}) },
    commodities: { ...DEFAULT_SIMULATION_CONFIG.commodities, ...(partial.commodities ?? {}) },
    recipes: { ...DEFAULT_SIMULATION_CONFIG.recipes, ...(partial.recipes ?? {}) },
  };
}
