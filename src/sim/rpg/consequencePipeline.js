import { generatedEntityId } from '../model/ids.js';
import { listEntities, getEntity } from '../model/worldState.js';

export function detectOpportunities(state, definition, { commandId, ordinalBase = 0 } = {}) {
  const events = [];
  const reasonCodes = [];
  let ordinal = ordinalBase;

  for (const shipment of listEntities(state, 'shipment', { includeDestroyed: false })) {
    if (shipment.data.status !== 'blocked' && shipment.data.status !== 'delayed') continue;
    const existing = listEntities(state, 'opportunity', { includeDestroyed: false })
      .find((o) => o.data.sourceEntityIds?.includes(shipment.id) && o.status === 'active');
    if (existing) continue;

    const id = generatedEntityId('opportunity', definition.worldId, commandId, ordinal);
    ordinal += 1;
    const type = 'clear_dangerous_route';
    events.push({
      type: 'entity.upserted',
      entityIds: [id],
      payload: {
        kind: 'opportunity',
        id,
        data: {
          type,
          sourceEntityIds: [shipment.id],
          targetEntityIds: shipment.data.routeEdgeIds ?? [],
          locationNodeId: null,
          urgency: shipment.data.riskState?.maxDanger ?? 0.5,
          createdAtTick: state.calendar.tick,
          expiresAtTick: state.calendar.tick + 1440 * 14,
          visibility: 'public',
          proposedObjectives: [
            { id: 'clear_route', description: 'Clear the dangerous route segment' },
            { id: 'escort_shipment', description: 'Escort the blocked shipment to destination' },
          ],
          proposedConsequences: [
            { id: 'restore_route_safety', effect: 'route_danger', value: 0 },
            { id: 'resume_shipment', effect: 'shipment_status', value: 'in_transit' },
          ],
          reasonCodes: ['shipment_blocked_danger'],
          opportunityStatus: 'open',
        },
      },
    });
    reasonCodes.push({ code: 'opportunity_detected', opportunityId: id, type, shipmentId: shipment.id });
  }

  for (const market of listEntities(state, 'market', { includeDestroyed: false })) {
    if ((market.data.foodSecurity ?? 1) >= 0.6) continue;
    const existing = listEntities(state, 'opportunity', { includeDestroyed: false })
      .find((o) => o.data.type === 'relieve_shortage'
        && o.data.sourceEntityIds?.includes(market.data.settlementId)
        && o.status === 'active');
    if (existing) continue;
    const id = generatedEntityId('opportunity', definition.worldId, commandId, ordinal);
    ordinal += 1;
    events.push({
      type: 'entity.upserted',
      entityIds: [id],
      payload: {
        kind: 'opportunity',
        id,
        data: {
          type: 'relieve_shortage',
          sourceEntityIds: [market.data.settlementId, market.id],
          targetEntityIds: [],
          locationNodeId: null,
          urgency: 1 - (market.data.foodSecurity ?? 0),
          createdAtTick: state.calendar.tick,
          expiresAtTick: state.calendar.tick + 1440 * 10,
          visibility: 'public',
          proposedObjectives: [
            { id: 'deliver_food', description: 'Deliver food or grain to the settlement' },
          ],
          proposedConsequences: [
            { id: 'improve_food_security', effect: 'food_security' },
          ],
          reasonCodes: ['food_shortage'],
          opportunityStatus: 'open',
        },
      },
    });
    reasonCodes.push({
      code: 'opportunity_detected',
      opportunityId: id,
      type: 'relieve_shortage',
      settlementId: market.data.settlementId,
    });
  }

  return { events, reasonCodes, nextOrdinal: ordinal };
}

export function createContractFromOpportunity(state, definition, {
  commandId,
  opportunityId,
  actorId = 'player',
  ordinal = 0,
}) {
  const opportunity = getEntity(state, 'opportunity', opportunityId);
  if (!opportunity || opportunity.data.opportunityStatus !== 'open') {
    throw Object.assign(new Error('opportunity_unavailable'), { code: 'opportunity_unavailable' });
  }
  const contractId = generatedEntityId('contract', definition.worldId, commandId, ordinal);
  const settlementId = opportunity.data.type === 'relieve_shortage'
    ? opportunity.data.sourceEntityIds[0]
    : null;

  return {
    contractId,
    events: [
      {
        type: 'entity.upserted',
        entityIds: [contractId],
        payload: {
          kind: 'contract',
          id: contractId,
          data: {
            opportunityId,
            type: opportunity.data.type,
            settlementId,
            actorId,
            objectives: (opportunity.data.proposedObjectives ?? []).map((o) => ({
              ...o,
              status: 'active',
            })),
            consequences: opportunity.data.proposedConsequences ?? [],
            status: 'accepted',
            acceptedAtTick: state.calendar.tick,
            deadlineTick: opportunity.data.expiresAtTick,
            reasonCodes: opportunity.data.reasonCodes ?? [],
            sourceEntityIds: opportunity.data.sourceEntityIds ?? [],
          },
        },
      },
      {
        type: 'entity.patched',
        entityIds: [opportunityId],
        payload: {
          kind: 'opportunity',
          id: opportunityId,
          dataPatch: { opportunityStatus: 'accepted', contractId },
        },
      },
    ],
    reasonCodes: [{ code: 'contract_accepted', contractId, opportunityId }],
  };
}

export function applyContractOutcome(state, {
  contractId,
  success,
  outcomeEvents = [],
}) {
  const contract = getEntity(state, 'contract', contractId);
  if (!contract) {
    throw Object.assign(new Error('missing_contract'), { code: 'missing_reference' });
  }
  const events = [...outcomeEvents];
  const reasonCodes = [];

  if (success) {
    for (const consequence of contract.data.consequences ?? []) {
      if (consequence.effect === 'route_danger') {
        for (const edgeId of listLinkedEdges(state, contract)) {
          events.push({
            type: 'entity.patched',
            entityIds: [edgeId],
            payload: {
              kind: 'graphEdge',
              id: edgeId,
              dataPatch: { danger: consequence.value ?? 0 },
            },
          });
        }
        for (const route of relatedRoutes(state, contract)) {
          events.push({
            type: 'entity.patched',
            entityIds: [route.id],
            payload: {
              kind: 'route',
              id: route.id,
              dataPatch: { danger: consequence.value ?? 0 },
            },
          });
        }
        reasonCodes.push({ code: 'route_cleared', contractId });
      }
      if (consequence.effect === 'shipment_status') {
        for (const shipmentId of contract.data.sourceEntityIds ?? []) {
          const shipment = getEntity(state, 'shipment', shipmentId);
          if (!shipment || shipment.kind !== 'shipment') continue;
          events.push({
            type: 'entity.patched',
            entityIds: [shipmentId],
            payload: {
              kind: 'shipment',
              id: shipmentId,
              dataPatch: {
                status: consequence.value ?? 'in_transit',
                riskState: { maxDanger: 0, reasonCodes: ['route_cleared'] },
              },
            },
          });
          reasonCodes.push({ code: 'shipment_resumed', shipmentId, contractId });
        }
      }
    }
    events.push({
      type: 'entity.patched',
      entityIds: [contractId],
      payload: {
        kind: 'contract',
        id: contractId,
        dataPatch: {
          status: 'completed',
          objectives: (contract.data.objectives ?? []).map((o) => ({ ...o, status: 'completed' })),
          completedAtTick: state.calendar.tick,
        },
      },
    });
    reasonCodes.push({ code: 'contract_completed', contractId });
  } else {
    events.push({
      type: 'entity.patched',
      entityIds: [contractId],
      payload: {
        kind: 'contract',
        id: contractId,
        dataPatch: { status: 'failed', failedAtTick: state.calendar.tick },
      },
    });
    reasonCodes.push({ code: 'contract_failed', contractId });
  }

  return { events, reasonCodes };
}

function listLinkedEdges(state, contract) {
  const edgeIds = new Set();
  for (const sourceId of contract.data.sourceEntityIds ?? []) {
    const shipment = getEntity(state, 'shipment', sourceId);
    if (shipment?.kind === 'shipment') {
      for (const id of shipment.data.routeEdgeIds ?? []) edgeIds.add(id);
    }
  }
  const opportunity = contract.data.opportunityId
    ? getEntity(state, 'opportunity', contract.data.opportunityId)
    : null;
  for (const id of opportunity?.data.targetEntityIds ?? []) edgeIds.add(id);
  return [...edgeIds].sort();
}

function relatedRoutes(state, contract) {
  const routeIds = new Set();
  for (const edgeId of listLinkedEdges(state, contract)) {
    const edge = getEntity(state, 'graphEdge', edgeId);
    if (edge?.data.routeId) routeIds.add(edge.data.routeId);
  }
  return [...routeIds]
    .map((id) => getEntity(state, 'route', id))
    .filter(Boolean);
}

/** Optional LLM presentation boundary — never owns canonical outcomes. */
export function createProseAdapter() {
  return {
    describeOpportunity(opportunity) {
      return {
        title: opportunity.data.type.replaceAll('_', ' '),
        summary: `Opportunity ${opportunity.id} (${opportunity.data.reasonCodes?.join(', ') ?? 'none'})`,
        structured: {
          opportunityId: opportunity.id,
          type: opportunity.data.type,
          reasonCodes: opportunity.data.reasonCodes ?? [],
        },
      };
    },
  };
}
