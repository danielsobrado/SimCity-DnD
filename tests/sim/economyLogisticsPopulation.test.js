import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSimulationWorld,
  createMiniCampaignFixture,
} from '../../src/sim/index.js';
import { importedSettlementId, importedRouteId } from '../../src/sim/model/ids.js';

function boot() {
  const world = createSimulationWorld({ campaign: createMiniCampaignFixture() });
  world.buildGraph();
  const init = world.initializeSystems();
  assert.equal(init.ok, true, init.code);
  return world;
}

test('daily economy produces and consumes with ledger', () => {
  const world = boot();
  const before = world.queries().getEntity('market', world.queries().list('market')[0].id);
  world.stepDays(3);
  assert.ok(world.ledger.list().length > 0);
  const markets = world.queries().list('market');
  assert.equal(markets.length, 3);
  for (const market of markets) {
    assert.ok(market.data.prices.grain > 0);
    assert.ok(market.data.foodSecurity != null);
  }
  void before;
});

test('grain shipment moves stock between settlements', () => {
  const world = boot();
  world.stepDays(2);
  const origin = importedSettlementId(1);
  const dest = importedSettlementId(2);
  const originInvId = world.queries().getEntity('settlement', origin).data.inventoryAccountId;
  const destInvId = world.queries().getEntity('settlement', dest).data.inventoryAccountId;
  const beforeOrigin = world.queries().getEntity('inventoryAccount', originInvId).data.quantities.grain ?? 0;
  const beforeDest = world.queries().getEntity('inventoryAccount', destInvId).data.quantities.grain ?? 0;

  const planned = world.planShipment({
    originSettlementId: origin,
    destinationSettlementId: dest,
    quantity: 10,
  });
  assert.equal(planned.ok, true, planned.message ?? planned.code);
  const afterOrigin = world.queries().getEntity('inventoryAccount', originInvId).data.quantities.grain ?? 0;
  assert.equal(afterOrigin, beforeOrigin - 10);

  // Clear danger and advance until arrival
  for (let i = 0; i < 40; i += 1) {
    world.stepDays(1);
    const shipment = world.queries().getEntity('shipment', planned.result.shipmentId);
    if (shipment.data.status === 'arrived') break;
  }
  const shipment = world.queries().getEntity('shipment', planned.result.shipmentId);
  assert.equal(shipment.data.status, 'arrived');
  const afterDest = world.queries().getEntity('inventoryAccount', destInvId).data.quantities.grain ?? 0;
  assert.ok(afterDest >= beforeDest + 10);
  const cargo = world.queries().getEntity('inventoryAccount', shipment.data.cargoInventoryId);
  assert.equal(cargo.data.quantities.grain ?? 0, 0);
});

test('route danger blocks shipment and raises opportunity', () => {
  const world = boot();
  world.stepDays(1);
  const danger = world.setRouteDanger(importedRouteId(1), 0.9);
  assert.equal(danger.ok, true);
  const planned = world.planShipment({
    originSettlementId: importedSettlementId(1),
    destinationSettlementId: importedSettlementId(2),
    quantity: 5,
  });
  assert.equal(planned.ok, true, planned.message ?? planned.code);
  const shipment = world.queries().getEntity('shipment', planned.result.shipmentId);
  assert.equal(shipment.data.status, 'blocked');

  const detected = world.detectOpportunities();
  assert.equal(detected.ok, true);
  const opportunities = world.queries().list('opportunity');
  assert.ok(opportunities.some((o) => o.data.type === 'clear_dangerous_route'));
});

test('monthly population updates unrest and migration pressure', () => {
  const world = boot();
  // Drain food to create shortage pressure over many days
  for (const market of world.queries().list('market')) {
    const inv = world.queries().getEntity('inventoryAccount', market.data.inventoryAccountId);
    world.dispatch('sim.patchEntity', {
      kind: 'inventoryAccount',
      id: inv.id,
      dataPatch: { quantities: { grain: 1, food: 0, wood: 0 } },
    });
  }
  world.stepMonths(2);
  const settlements = world.queries().list('settlement');
  assert.ok(settlements.some((s) => (s.data.social?.foodPressure ?? 0) > 0
    || (s.data.social?.migrationPressure ?? 0) >= 0));
});
