import { DEFAULT_SIMULATION_CONFIG } from '../sim/config/defaultSimulationConfig.js';

function assertPositive(value, path) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid simulation configuration: ${path} must be positive.`);
  }
}

function assertNonNegInt(value, path) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid simulation configuration: ${path} must be a non-negative integer.`);
  }
}

function assertBoolean(value, path) {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid simulation configuration: ${path} must be boolean.`);
  }
}

export function validateSimulationConfig(simulation) {
  if (simulation == null) return simulation;
  if (typeof simulation !== 'object' || Array.isArray(simulation)) {
    throw new Error('Invalid simulation configuration: simulation must be an object.');
  }

  assertNonNegInt(simulation.schemaVersion ?? DEFAULT_SIMULATION_CONFIG.schemaVersion, 'simulation.schemaVersion');
  assertNonNegInt(simulation.projectionVersion ?? DEFAULT_SIMULATION_CONFIG.projectionVersion, 'simulation.projectionVersion');
  if (simulation.strictValidation !== undefined) {
    assertBoolean(simulation.strictValidation, 'simulation.strictValidation');
  }
  if (simulation.retainDestroyedEntities !== undefined) {
    assertBoolean(simulation.retainDestroyedEntities, 'simulation.retainDestroyedEntities');
  }
  assertPositive(simulation.maxEventsPerTick ?? DEFAULT_SIMULATION_CONFIG.maxEventsPerTick, 'simulation.maxEventsPerTick');

  const time = simulation.time ?? {};
  for (const key of [
    'ticksPerHour', 'hoursPerDay', 'daysPerWeek', 'daysPerMonth', 'monthsPerYear',
    'initialYear', 'initialMonth', 'initialDay',
  ]) {
    if (time[key] !== undefined) assertPositive(time[key], `simulation.time.${key}`);
  }
  if (time.initialHour !== undefined) assertNonNegInt(time.initialHour, 'simulation.time.initialHour');

  const geography = simulation.geography ?? {};
  for (const key of [
    'roadSpeedKmPerHour', 'trailSpeedKmPerHour', 'riverDownstreamSpeedKmPerHour',
    'riverUpstreamSpeedKmPerHour', 'seaSpeedKmPerHour', 'maxGeneratedSeaLaneKm',
  ]) {
    if (geography[key] !== undefined) assertPositive(geography[key], `simulation.geography.${key}`);
  }

  if (simulation.commodities) {
    if (typeof simulation.commodities !== 'object' || Array.isArray(simulation.commodities)) {
      throw new Error('Invalid simulation configuration: simulation.commodities must be an object.');
    }
    for (const [id, def] of Object.entries(simulation.commodities)) {
      assertPositive(def.unitMassKg, `simulation.commodities.${id}.unitMassKg`);
      assertPositive(def.baseValue, `simulation.commodities.${id}.baseValue`);
      if (def.spoilagePerDay !== undefined && (!Number.isFinite(def.spoilagePerDay) || def.spoilagePerDay < 0)) {
        throw new Error(`Invalid simulation configuration: simulation.commodities.${id}.spoilagePerDay must be >= 0.`);
      }
    }
  }

  return simulation;
}
