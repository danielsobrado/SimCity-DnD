import { createWorldDefinition } from '../model/worldDefinition.js';
import {
  createEmptyWorldState,
  createAndPutEntity,
} from '../model/worldState.js';
import {
  importedCultureId,
  importedRegionProvinceId,
  importedRegionStateId,
  importedReligionId,
  importedRiverId,
  importedRouteId,
  importedSettlementId,
} from '../model/ids.js';
import { checksumCanonical } from '../persistence/canonicalSerialize.js';
import { PROJECTION_VERSION } from './projectionVersion.js';

function sortBySourceId(items) {
  return [...(items ?? [])]
    .filter((item) => item && item.i != null && !item.removed)
    .sort((a, b) => Number(a.i) - Number(b.i));
}

export function fingerprintCampaignSource(campaign) {
  const source = campaign?.source ?? {};
  return checksumCanonical({
    type: source.type ?? null,
    mapId: source.mapId ?? null,
    seed: source.seed ?? null,
    version: source.version ?? null,
    sourceWidth: source.sourceWidth ?? null,
    sourceHeight: source.sourceHeight ?? null,
    states: sortBySourceId(campaign?.states).map((s) => ({ i: s.i, name: s.name })),
    provinces: sortBySourceId(campaign?.provinces).map((p) => ({ i: p.i, name: p.name, state: p.state ?? null })),
    burgs: sortBySourceId(campaign?.burgs).map((b) => ({
      i: b.i, name: b.name, x: b.x, y: b.y, state: b.state ?? null, capital: !!b.capital,
    })),
    cultures: sortBySourceId(campaign?.cultures).map((c) => ({ i: c.i, name: c.name })),
    religions: sortBySourceId(campaign?.religions).map((r) => ({ i: r.i, name: r.name })),
    routes: sortBySourceId(campaign?.routes).map((r) => ({
      i: r.i, group: r.group ?? 'roads', points: r.points ?? null,
    })),
    rivers: sortBySourceId(campaign?.rivers).map((r) => ({
      i: r.i, name: r.name ?? null, discharge: r.discharge ?? null,
    })),
  });
}

export function projectAzgaarWorld(campaign, {
  worldId = null,
  schemaVersion = 1,
  simulationConfig = {},
} = {}) {
  const source = campaign?.source ?? {};
  const resolvedWorldId = worldId
    ?? String(source.mapId ?? source.seed ?? 'world');
  const sourceFingerprint = fingerprintCampaignSource(campaign);
  const seed = String(source.seed ?? simulationConfig.seed ?? resolvedWorldId);

  const cultures = sortBySourceId(campaign?.cultures).map((c) => ({
    id: importedCultureId(c.i),
    sourceId: c.i,
    name: String(c.name ?? `Culture ${c.i}`),
    color: c.color ?? null,
  }));
  const religions = sortBySourceId(campaign?.religions).map((r) => ({
    id: importedReligionId(r.i),
    sourceId: r.i,
    name: String(r.name ?? `Religion ${r.i}`),
    color: r.color ?? null,
  }));

  const definition = createWorldDefinition({
    worldId: resolvedWorldId,
    seed,
    sourceFingerprint,
    projectionVersion: PROJECTION_VERSION,
    schemaVersion,
    physicalScale: {
      mapWidth: Number(source.sourceWidth ?? 0),
      mapHeight: Number(source.sourceHeight ?? 0),
      kilometersPerUnit: Number(simulationConfig.kilometersPerUnit ?? 1),
    },
    cultures,
    religions,
    biomes: [],
    sourceMeta: {
      type: source.type ?? 'azgaar-campaign',
      mapName: source.mapName ?? null,
      version: source.version ?? null,
    },
  });

  const state = createEmptyWorldState({
    calendar: {
      tick: 0,
      year: simulationConfig.time?.initialYear ?? 1,
      month: simulationConfig.time?.initialMonth ?? 1,
      day: simulationConfig.time?.initialDay ?? 1,
      hour: simulationConfig.time?.initialHour ?? 8,
      minute: 0,
    },
    revision: 0,
  });

  for (const s of sortBySourceId(campaign?.states)) {
    createAndPutEntity(state, {
      id: importedRegionStateId(s.i),
      kind: 'region',
      data: {
        regionType: 'state',
        sourceId: s.i,
        name: String(s.name ?? s.fullName ?? `State ${s.i}`),
        color: s.color ?? null,
        pole: s.pole ?? null,
        center: s.center ?? null,
        parentRegionId: null,
      },
    });
  }

  for (const p of sortBySourceId(campaign?.provinces)) {
    const stateId = p.state != null ? importedRegionStateId(p.state) : null;
    createAndPutEntity(state, {
      id: importedRegionProvinceId(p.i),
      kind: 'region',
      data: {
        regionType: 'province',
        sourceId: p.i,
        name: String(p.name ?? `Province ${p.i}`),
        color: p.color ?? null,
        pole: p.pole ?? null,
        center: p.center ?? null,
        parentRegionId: stateId,
        stateSourceId: p.state ?? null,
      },
    });
  }

  for (const b of sortBySourceId(campaign?.burgs)) {
    const stateId = b.state != null ? importedRegionStateId(b.state) : null;
    createAndPutEntity(state, {
      id: importedSettlementId(b.i),
      kind: 'settlement',
      data: {
        sourceId: b.i,
        name: String(b.name ?? `Burg ${b.i}`),
        x: Number(b.x ?? 0),
        y: Number(b.y ?? 0),
        capital: !!b.capital,
        stateId,
        provinceId: b.province != null ? importedRegionProvinceId(b.province) : null,
        regionId: stateId,
        population: Number(b.population ?? 0),
      },
    });
  }

  for (const r of sortBySourceId(campaign?.routes)) {
    createAndPutEntity(state, {
      id: importedRouteId(r.i),
      kind: 'route',
      data: {
        sourceId: r.i,
        group: String(r.group ?? 'roads'),
        points: Array.isArray(r.points) ? r.points.map((p) => [...p]) : [],
        fromSettlementId: null,
        toSettlementId: null,
        condition: 1,
        danger: 0,
      },
    });
  }

  for (const river of sortBySourceId(campaign?.rivers)) {
    createAndPutEntity(state, {
      id: importedRiverId(river.i),
      kind: 'route',
      tags: ['river'],
      data: {
        sourceId: river.i,
        group: 'river',
        name: river.name ?? null,
        discharge: river.discharge ?? null,
        points: Array.isArray(river.points) ? river.points.map((p) => [...p]) : [],
        fromSettlementId: null,
        toSettlementId: null,
        condition: 1,
        danger: 0,
      },
    });
  }

  return { definition, state };
}
