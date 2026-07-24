import { createAndPutEntity, listEntities, getEntity, upsertEntity } from '../model/worldState.js';
import { bumpEntity } from '../model/entityEnvelope.js';
import { generatedEntityId } from '../model/ids.js';

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function nearestSettlement(settlements, point) {
  let best = null;
  let bestD = Infinity;
  for (const s of settlements) {
    const d = dist({ x: s.data.x, y: s.data.y }, point);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { settlement: best, distance: bestD };
}

export function buildGeographicGraph(state, definition, {
  commandId = 'graph-build',
  config = {},
} = {}) {
  const settlements = listEntities(state, 'settlement', { includeDestroyed: false });
  const routes = listEntities(state, 'route', { includeDestroyed: false });
  const kmPerUnit = definition.physicalScale.kilometersPerUnit || 1;
  const roadSpeed = config.geography?.roadSpeedKmPerHour ?? 5;
  const trailSpeed = config.geography?.trailSpeedKmPerHour ?? 3;
  const riverDown = config.geography?.riverDownstreamSpeedKmPerHour ?? 8;
  const riverUp = config.geography?.riverUpstreamSpeedKmPerHour ?? 3;

  // Clear previous graph entities by marking destroyed is heavy; for rebuild we replace maps.
  state.graphNodes.clear();
  state.graphEdges.clear();

  const nodeBySettlement = new Map();
  let ordinal = 0;

  for (const settlement of settlements) {
    const nodeId = generatedEntityId('graphNode', definition.worldId, commandId, ordinal);
    ordinal += 1;
    createAndPutEntity(state, {
      id: nodeId,
      kind: 'graphNode',
      data: {
        nodeKind: 'settlement',
        canonicalPosition: { x: settlement.data.x, y: settlement.data.y },
        regionId: settlement.data.regionId ?? null,
        settlementId: settlement.id,
        enabled: true,
      },
    });
    nodeBySettlement.set(settlement.id, nodeId);
  }

  let edgeOrdinal = 0;
  for (const route of routes) {
    const points = route.data.points ?? [];
    let fromId = route.data.fromSettlementId;
    let toId = route.data.toSettlementId;

    if ((!fromId || !toId) && points.length >= 2) {
      const start = { x: Number(points[0][0]), y: Number(points[0][1]) };
      const end = { x: Number(points[points.length - 1][0]), y: Number(points[points.length - 1][1]) };
      const nearStart = nearestSettlement(settlements, start);
      const nearEnd = nearestSettlement(settlements, end);
      if (nearStart.settlement && nearEnd.settlement
          && nearStart.settlement.id !== nearEnd.settlement.id) {
        fromId = nearStart.settlement.id;
        toId = nearEnd.settlement.id;
        upsertEntity(state, bumpEntity(route, state.calendar.tick, {
          fromSettlementId: fromId,
          toSettlementId: toId,
        }));
      }
    }

    if (!fromId || !toId) continue;
    const fromNode = nodeBySettlement.get(fromId);
    const toNode = nodeBySettlement.get(toId);
    if (!fromNode || !toNode) continue;

    const fromS = getEntity(state, 'settlement', fromId);
    const toS = getEntity(state, 'settlement', toId);
    const distanceUnits = dist(
      { x: fromS.data.x, y: fromS.data.y },
      { x: toS.data.x, y: toS.data.y },
    );
    const distanceMeters = distanceUnits * kmPerUnit * 1000;
    const isRiver = route.data.group === 'river' || (route.tags ?? []).includes('river');
    const isTrail = route.data.group === 'trails' || route.data.group === 'trail';
    let speed = roadSpeed;
    if (isRiver) speed = riverDown;
    else if (isTrail) speed = trailSpeed;
    const distanceKm = distanceMeters / 1000;
    const baseTravelHours = speed > 0 ? distanceKm / speed : Number.POSITIVE_INFINITY;

    const edgeKind = isRiver ? 'navigable_river' : (isTrail ? 'trail' : 'road');
    const forwardId = generatedEntityId('graphEdge', definition.worldId, commandId, edgeOrdinal);
    edgeOrdinal += 1;
    createAndPutEntity(state, {
      id: forwardId,
      kind: 'graphEdge',
      data: {
        edgeKind,
        fromNodeId: fromNode,
        toNodeId: toNode,
        routeId: route.id,
        distanceMeters,
        baseTravelHours,
        capacity: 10,
        condition: route.data.condition ?? 1,
        danger: route.data.danger ?? 0,
        ownerFactionId: null,
        accessPolicy: 'open',
        seasonalFlags: [],
        direction: 'forward',
      },
    });

    const reverseHours = isRiver
      ? (riverUp > 0 ? distanceKm / riverUp : baseTravelHours * 2)
      : baseTravelHours;
    const reverseId = generatedEntityId('graphEdge', definition.worldId, commandId, edgeOrdinal);
    edgeOrdinal += 1;
    createAndPutEntity(state, {
      id: reverseId,
      kind: 'graphEdge',
      data: {
        edgeKind,
        fromNodeId: toNode,
        toNodeId: fromNode,
        routeId: route.id,
        distanceMeters,
        baseTravelHours: reverseHours,
        capacity: 10,
        condition: route.data.condition ?? 1,
        danger: route.data.danger ?? 0,
        ownerFactionId: null,
        accessPolicy: 'open',
        seasonalFlags: [],
        direction: 'reverse',
      },
    });
  }

  // Administrative containment: provinces under states already encoded in region.parentRegionId
  const stateSettlements = new Map();
  for (const s of settlements) {
    const sid = s.data.stateId;
    if (!sid) continue;
    if (!stateSettlements.has(sid)) stateSettlements.set(sid, []);
    stateSettlements.get(sid).push(s.id);
  }

  // Border adjacency: states that share settlement proximity across different parents
  const borderPairs = new Map();
  const regions = listEntities(state, 'region', { includeDestroyed: false })
    .filter((r) => r.data.regionType === 'state');
  for (let i = 0; i < regions.length; i += 1) {
    for (let j = i + 1; j < regions.length; j += 1) {
      const a = regions[i];
      const b = regions[j];
      const key = [a.id, b.id].sort().join('|');
      borderPairs.set(key, {
        regionAId: a.id,
        regionBId: b.id,
        accessPolicy: 'open',
        borderLength: 1,
      });
    }
  }

  // Sea lanes between coastal settlements (tagged capital or near map edge heuristic)
  const seaSpeed = config.geography?.seaSpeedKmPerHour ?? 12;
  const maxSeaKm = config.geography?.maxGeneratedSeaLaneKm ?? 400;
  const ports = settlements.filter((s) => s.data.capital || s.data.port);
  for (let i = 0; i < ports.length; i += 1) {
    for (let j = i + 1; j < ports.length; j += 1) {
      const a = ports[i];
      const b = ports[j];
      const distanceUnits = dist({ x: a.data.x, y: a.data.y }, { x: b.data.x, y: b.data.y });
      const distanceKm = (distanceUnits * kmPerUnit);
      if (distanceKm > maxSeaKm) continue;
      const fromNode = nodeBySettlement.get(a.id);
      const toNode = nodeBySettlement.get(b.id);
      if (!fromNode || !toNode) continue;
      const hours = seaSpeed > 0 ? distanceKm / seaSpeed : Number.POSITIVE_INFINITY;
      for (const [from, to, direction] of [
        [fromNode, toNode, 'forward'],
        [toNode, fromNode, 'reverse'],
      ]) {
        const seaEdgeId = generatedEntityId('graphEdge', definition.worldId, commandId, edgeOrdinal);
        edgeOrdinal += 1;
        createAndPutEntity(state, {
          id: seaEdgeId,
          kind: 'graphEdge',
          data: {
            edgeKind: 'sea_lane',
            fromNodeId: from,
            toNodeId: to,
            routeId: null,
            distanceMeters: distanceKm * 1000,
            baseTravelHours: hours,
            capacity: 20,
            condition: 1,
            danger: 0.1,
            ownerFactionId: null,
            accessPolicy: 'open',
            seasonalFlags: [],
            direction,
            tollCost: 0,
          },
        });
      }
    }
  }

  return {
    nodeCount: state.graphNodes.size,
    edgeCount: state.graphEdges.size,
    borders: [...borderPairs.values()].sort((a, b) => (
      a.regionAId.localeCompare(b.regionAId) || a.regionBId.localeCompare(b.regionBId)
    )),
    stateSettlementIndex: Object.fromEntries(
      [...stateSettlements.entries()].map(([k, v]) => [k, v.sort()]),
    ),
  };
}

export function setEdgeAccessPolicy(state, edgeId, accessPolicy) {
  const edge = getEntity(state, 'graphEdge', edgeId);
  if (!edge) {
    throw Object.assign(new Error('missing_edge'), { code: 'missing_reference' });
  }
  return {
    events: [{
      type: 'entity.patched',
      entityIds: [edgeId],
      payload: {
        kind: 'graphEdge',
        id: edgeId,
        dataPatch: { accessPolicy },
      },
    }],
    reasonCodes: [{ code: 'edge_access_updated', edgeId, accessPolicy }],
  };
}

export function setBorderAccessByRegions(state, regionAId, regionBId, accessPolicy) {
  const events = [];
  const settlementIdsA = new Set(
    listEntities(state, 'settlement', { includeDestroyed: false })
      .filter((s) => s.data.stateId === regionAId)
      .map((s) => s.id),
  );
  const settlementIdsB = new Set(
    listEntities(state, 'settlement', { includeDestroyed: false })
      .filter((s) => s.data.stateId === regionBId)
      .map((s) => s.id),
  );
  const nodeBySettlement = new Map();
  for (const node of listEntities(state, 'graphNode', { includeDestroyed: false })) {
    if (node.data.settlementId) nodeBySettlement.set(node.data.settlementId, node.id);
  }
  for (const edge of listEntities(state, 'graphEdge', { includeDestroyed: false })) {
    const from = getEntity(state, 'graphNode', edge.data.fromNodeId);
    const to = getEntity(state, 'graphNode', edge.data.toNodeId);
    const fromS = from?.data.settlementId;
    const toS = to?.data.settlementId;
    if (!fromS || !toS) continue;
    const crosses = (settlementIdsA.has(fromS) && settlementIdsB.has(toS))
      || (settlementIdsB.has(fromS) && settlementIdsA.has(toS));
    if (!crosses) continue;
    events.push({
      type: 'entity.patched',
      entityIds: [edge.id],
      payload: {
        kind: 'graphEdge',
        id: edge.id,
        dataPatch: { accessPolicy },
      },
    });
  }
  return {
    events,
    reasonCodes: [{
      code: 'border_access_updated',
      regionAId,
      regionBId,
      accessPolicy,
      edgesAffected: events.length,
    }],
  };
}

export function edgeTravelCostBreakdown(edge, {
  dangerWeight = 1,
  tollWeight = 1,
  tollCost = null,
} = {}) {
  const data = edge.data;
  const terrainModifier = 1;
  const conditionModifier = 1 / Math.max(0.1, data.condition ?? 1);
  const accessModifier = data.accessPolicy === 'closed' || data.accessPolicy === 'embargo'
    ? Number.POSITIVE_INFINITY
    : 1;
  const resolvedToll = tollCost ?? data.tollCost ?? 0;
  if (!Number.isFinite(accessModifier)) {
    return {
      total: Number.POSITIVE_INFINITY,
      components: {
        baseTime: data.baseTravelHours,
        terrainModifier,
        conditionModifier,
        accessModifier,
        dangerCost: (data.danger ?? 0) * dangerWeight,
        tollCost: resolvedToll * tollWeight,
        reasonCodes: ['access_closed'],
      },
    };
  }
  const baseAdjusted = data.baseTravelHours * terrainModifier * conditionModifier * accessModifier;
  const dangerCost = (data.danger ?? 0) * dangerWeight;
  const toll = resolvedToll * tollWeight;
  return {
    total: baseAdjusted + dangerCost + toll,
    components: {
      baseTime: data.baseTravelHours,
      terrainModifier,
      conditionModifier,
      accessModifier,
      dangerCost,
      tollCost: toll,
      reasonCodes: [],
    },
  };
}

export function edgeTravelCost(edge, options = {}) {
  return edgeTravelCostBreakdown(edge, options).total;
}

export function shortestPath(state, fromNodeId, toNodeId, options = {}) {
  const edges = listEntities(state, 'graphEdge', { includeDestroyed: false })
    .filter((e) => e.data.enabled !== false);
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.data.fromNodeId)) adjacency.set(edge.data.fromNodeId, []);
    adjacency.get(edge.data.fromNodeId).push(edge);
  }

  const distMap = new Map([[fromNodeId, 0]]);
  const prev = new Map();
  const prevEdge = new Map();
  const queue = [{ id: fromNodeId, cost: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
    const current = queue.shift();
    if (current.id === toNodeId) break;
    if (current.cost > (distMap.get(current.id) ?? Infinity)) continue;
    for (const edge of adjacency.get(current.id) ?? []) {
      const cost = edgeTravelCost(edge, options);
      if (!Number.isFinite(cost)) continue;
      const nextCost = current.cost + cost;
      const existing = distMap.get(edge.data.toNodeId);
      if (existing == null || nextCost < existing
          || (nextCost === existing && edge.id.localeCompare(prevEdge.get(edge.data.toNodeId) ?? '') < 0)) {
        distMap.set(edge.data.toNodeId, nextCost);
        prev.set(edge.data.toNodeId, current.id);
        prevEdge.set(edge.data.toNodeId, edge.id);
        queue.push({ id: edge.data.toNodeId, cost: nextCost });
      }
    }
  }

  if (!distMap.has(toNodeId)) {
    return {
      ok: false,
      code: 'unreachable',
      nodeIds: [],
      edgeIds: [],
      cost: null,
      costBreakdown: [],
    };
  }

  const nodeIds = [];
  const edgeIds = [];
  let cursor = toNodeId;
  while (cursor !== fromNodeId) {
    nodeIds.push(cursor);
    edgeIds.push(prevEdge.get(cursor));
    cursor = prev.get(cursor);
  }
  nodeIds.push(fromNodeId);
  nodeIds.reverse();
  edgeIds.reverse();
  const costBreakdown = edgeIds.map((edgeId) => {
    const edge = getEntity(state, 'graphEdge', edgeId);
    return {
      edgeId,
      ...edgeTravelCostBreakdown(edge, options),
    };
  });
  return {
    ok: true,
    code: 'ok',
    nodeIds,
    edgeIds,
    cost: distMap.get(toNodeId),
    costBreakdown,
  };
}

export function findSettlementNodeId(state, settlementId) {
  for (const node of listEntities(state, 'graphNode', { includeDestroyed: false })) {
    if (node.data.settlementId === settlementId) return node.id;
  }
  return null;
}

export class PathCache {
  constructor(limit = 2048) {
    this.limit = limit;
    this.map = new Map();
  }

  key(from, to) {
    return `${from}->${to}`;
  }

  get(from, to) {
    return this.map.get(this.key(from, to)) ?? null;
  }

  set(from, to, value) {
    const k = this.key(from, to);
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, value);
    if (this.map.size > this.limit) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
  }

  clear() {
    this.map.clear();
  }
}
