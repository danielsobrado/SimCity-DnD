import { listEntities, getEntity } from '../model/worldState.js';

function freezeDto(value) {
  return deepFreeze(structuredClone(value));
}

function deepFreeze(value) {
  if (value == null || typeof value !== 'object') return value;
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

export function buildDashboardViewModel(queries, extra = {}) {
  const calendar = queries.getCalendar();
  const counts = queries.countByKind();
  return freezeDto({
    kind: 'dashboard',
    calendar,
    revision: queries.getRevision(),
    checksum: queries.getStateChecksum(),
    entityCounts: counts,
    alerts: extra.alerts ?? [],
    activeContracts: queries.list('contract', { includeDestroyed: false })
      .filter((c) => c.data.status === 'accepted' || c.data.status === 'active')
      .map((c) => ({
        id: c.id,
        type: c.data.type,
        deadlineTick: c.data.deadlineTick,
        reasonCodes: c.data.reasonCodes ?? [],
      })),
  });
}

export function buildEconomyOverlay(queries) {
  const markets = queries.list('market', { includeDestroyed: false });
  return freezeDto({
    kind: 'economyOverlay',
    settlements: markets.map((m) => ({
      marketId: m.id,
      settlementId: m.data.settlementId,
      foodSecurity: m.data.foodSecurity ?? null,
      prices: m.data.prices ?? {},
    })).sort((a, b) => a.settlementId.localeCompare(b.settlementId)),
  });
}

export function buildTradeOverlay(queries) {
  const shipments = queries.list('shipment', { includeDestroyed: false });
  return freezeDto({
    kind: 'tradeOverlay',
    shipments: shipments.map((s) => ({
      id: s.id,
      originSettlementId: s.data.originSettlementId,
      destinationSettlementId: s.data.destinationSettlementId,
      status: s.data.status,
      commodityId: s.data.commodityId,
      quantity: s.data.quantity,
      risk: s.data.riskState ?? null,
      reasonCodes: s.data.riskState?.reasonCodes ?? [],
    })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function buildPopulationOverlay(queries) {
  const settlements = queries.list('settlement', { includeDestroyed: false });
  return freezeDto({
    kind: 'populationOverlay',
    settlements: settlements.map((s) => ({
      id: s.id,
      name: s.data.name,
      population: s.data.population ?? 0,
      social: s.data.social ?? null,
      simTier: s.data.simTier ?? 'A',
    })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function buildFactionOverlay(queries) {
  const factions = queries.list('faction', { includeDestroyed: false });
  return freezeDto({
    kind: 'factionOverlay',
    factions: factions.map((f) => ({
      id: f.id,
      name: f.data.name,
      type: f.data.type,
      lastDecision: f.data.lastDecision ?? null,
      legitimacy: f.data.legitimacy,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function buildConflictOverlay(queries) {
  return freezeDto({
    kind: 'conflictOverlay',
    conflicts: queries.list('conflict', { includeDestroyed: false }).map((c) => ({
      id: c.id,
      type: c.data.conflictType,
      factionIds: c.data.factionIds,
      intensity: c.data.intensity,
      status: c.data.status,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function buildContractOverlay(queries) {
  return freezeDto({
    kind: 'contractOverlay',
    contracts: queries.list('contract', { includeDestroyed: false }).map((c) => ({
      id: c.id,
      type: c.data.type,
      status: c.data.status,
      reasonCodes: c.data.reasonCodes ?? [],
      objectives: c.data.objectives ?? [],
    })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function buildSettlementInspector(queries, settlementId) {
  const settlement = queries.getEntity('settlement', settlementId);
  if (!settlement) return null;
  const market = settlement.data.marketId
    ? queries.getEntity('market', settlement.data.marketId)
    : null;
  const inventory = settlement.data.inventoryAccountId
    ? queries.getEntity('inventoryAccount', settlement.data.inventoryAccountId)
    : null;
  return freezeDto({
    kind: 'settlementInspector',
    settlement,
    market,
    inventory,
  });
}

export function buildRouteInspector(queries, routeId) {
  const route = queries.getEntity('route', routeId);
  if (!route) return null;
  const edges = queries.list('graphEdge', { includeDestroyed: false })
    .filter((e) => e.data.routeId === routeId)
    .map((e) => ({
      id: e.id,
      danger: e.data.danger,
      condition: e.data.condition,
      fromNodeId: e.data.fromNodeId,
      toNodeId: e.data.toNodeId,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return freezeDto({
    kind: 'routeInspector',
    route,
    edges,
  });
}

export function buildShipmentInspector(queries, shipmentId) {
  const shipment = queries.getEntity('shipment', shipmentId);
  if (!shipment) return null;
  return freezeDto({
    kind: 'shipmentInspector',
    shipment,
  });
}

export function buildAlertsViewModel(reasonCodes = []) {
  return freezeDto({
    kind: 'alerts',
    items: [...reasonCodes]
      .map((r, index) => ({
        id: `alert:${index}:${r.code}`,
        code: r.code,
        payload: r,
        priority: priorityForCode(r.code),
      }))
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)),
  });
}

export function buildTimelineViewModel(worldEvents, domainEvents = []) {
  const items = [
    ...worldEvents.map((e) => ({
      id: e.id,
      tick: e.createdAtTick ?? e.updatedAtTick ?? 0,
      type: e.data?.eventType ?? e.kind,
      summary: e.data?.summary ?? e.id,
      reasonCodes: e.data?.reasonCodes ?? [],
    })),
    ...domainEvents.map((e) => ({
      id: e.id,
      tick: e.tick,
      type: e.type,
      summary: e.type,
      reasonCodes: e.payload?.reasonCodes ?? [],
    })),
  ].sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
  return freezeDto({ kind: 'timeline', items });
}

export function buildCausalExplanation(reasonCodes = []) {
  return freezeDto({
    kind: 'causalExplanation',
    steps: reasonCodes.map((r, index) => ({
      order: index,
      code: r.code,
      detail: r,
    })),
  });
}

export function buildTimeControlViewModel(clock) {
  return freezeDto({
    kind: 'timeControls',
    tick: clock.getTick(),
    paused: clock.isPaused(),
    speed: clock.getSpeed(),
    calendar: clock.getCalendar(),
  });
}

export function buildSaveDiagnosticViewModel(report) {
  return freezeDto({
    kind: 'saveDiagnostics',
    ...report,
  });
}

function priorityForCode(code) {
  if (code.includes('war') || code.includes('checksum') || code.includes('error')) return 100;
  if (code.includes('blocked') || code.includes('shortage') || code.includes('danger')) return 80;
  if (code.includes('contract')) return 60;
  return 20;
}

export function buildAllOverlays(queries, { reasonCodes = [], clock = null, report = null } = {}) {
  return freezeDto({
    dashboard: buildDashboardViewModel(queries, { alerts: buildAlertsViewModel(reasonCodes).items }),
    economy: buildEconomyOverlay(queries),
    trade: buildTradeOverlay(queries),
    population: buildPopulationOverlay(queries),
    factions: buildFactionOverlay(queries),
    conflicts: buildConflictOverlay(queries),
    contracts: buildContractOverlay(queries),
    alerts: buildAlertsViewModel(reasonCodes),
    timeline: buildTimelineViewModel(queries.list('worldEvent', { includeDestroyed: true })),
    causal: buildCausalExplanation(reasonCodes),
    timeControls: clock ? buildTimeControlViewModel(clock) : null,
    saveDiagnostics: report ? buildSaveDiagnosticViewModel(report) : null,
  });
}

// silence unused import lint-style usage in some bundlers
void getEntity;
void listEntities;
