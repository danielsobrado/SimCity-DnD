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
  // Settlement connections complete. Border adjacency from shared state among settlements.
  const stateSettlements = new Map();
  for (const s of settlements) {
    const sid = s.data.stateId;
    if (!sid) continue;
    if (!stateSettlements.has(sid)) stateSettlements.set(sid, []);
    stateSettlements.get(sid).push(s.id);
  }

  return {
    nodeCount: state.graphNodes.size,
    edgeCount: state.graphEdges.size,
    stateSettlementIndex: Object.fromEntries(
      [...stateSettlements.entries()].map(([k, v]) => [k, v.sort()]),
    ),
  };
}

export function edgeTravelCost(edge, {
  dangerWeight = 1,
  tollWeight = 1,
  tollCost = 0,
} = {}) {
  const data = edge.data;
  const terrainModifier = 1;
  const conditionModifier = 1 / Math.max(0.1, data.condition ?? 1);
  const accessModifier = data.accessPolicy === 'closed' ? Number.POSITIVE_INFINITY : 1;
  if (!Number.isFinite(accessModifier)) return Number.POSITIVE_INFINITY;
  return (data.baseTravelHours * terrainModifier * conditionModifier * accessModifier)
    + ((data.danger ?? 0) * dangerWeight)
    + (tollCost * tollWeight);
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
    return { ok: false, code: 'unreachable', nodeIds: [], edgeIds: [], cost: null };
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
  return {
    ok: true,
    code: 'ok',
    nodeIds,
    edgeIds,
    cost: distMap.get(toNodeId),
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
