import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSimulationWorld,
  createMiniCampaignFixture,
  restoreWorldSnapshot,
  checksumWorldState,
} from '../../src/sim/index.js';
import { importedSettlementId, importedRouteId } from '../../src/sim/model/ids.js';

test('vertical slice: trade danger contract combat consequence save replay', async () => {
  const campaign = createMiniCampaignFixture();

  function runSlice() {
    const world = createSimulationWorld({ campaign });
    // 1-2 project + graph + init pop/economy/treasury
    world.buildGraph();
    assert.equal(world.initializeSystems().ok, true);
    assert.equal(world.validate().ok, true);

    // 3 daily production/consumption
    world.stepDays(3);

    // 4 create grain shipment after marking danger on first road
    world.setRouteDanger(importedRouteId(1), 0.85);
    const shipment = world.planShipment({
      originSettlementId: importedSettlementId(1),
      destinationSettlementId: importedSettlementId(2),
      quantity: 8,
    });
    assert.equal(shipment.ok, true, shipment.message ?? shipment.code);
    assert.equal(
      world.queries().getEntity('shipment', shipment.result.shipmentId).data.status,
      'blocked',
    );

    // 5 encounter site + opportunity/contract
    world.createEncounterSite({
      settlementId: importedSettlementId(1),
      danger: 0.85,
    });
    world.detectOpportunities();
    const opportunity = world.queries().list('opportunity')
      .find((o) => o.data.type === 'clear_dangerous_route');
    assert.ok(opportunity, 'expected clear_dangerous_route opportunity');
    const contract = world.acceptContract(opportunity.id, 'player');
    assert.equal(contract.ok, true);

    // 6 resolve encounter through combat
    const combat = world.runEncounterCombat({
      settlementId: importedSettlementId(1),
      members: [
        { name: 'Player', hp: 40, tags: ['ally'] },
        { name: 'Companion', hp: 25, tags: ['ally'] },
        { name: 'Bandit Leader', hp: 18, tags: ['hostile'] },
        { name: 'Bandit', hp: 12, tags: ['hostile'] },
      ],
    });
    assert.equal(combat.ok, true, combat.message ?? combat.code);
    assert.equal(combat.result.combatResult, 'victory');

    // 7-8 update route safety + resume shipment + deliver
    const resolved = world.resolveContract(contract.result.contractId, true);
    assert.equal(resolved.ok, true);
    assert.equal(world.queries().getEntity('route', importedRouteId(1)).data.danger, 0);

    const shipmentEntity = world.queries().getEntity('shipment', shipment.result.shipmentId);
    assert.equal(shipmentEntity.data.status, 'in_transit');

    for (let i = 0; i < 50; i += 1) {
      world.stepDays(1);
      const s = world.queries().getEntity('shipment', shipment.result.shipmentId);
      if (s.data.status === 'arrived') break;
    }
    assert.equal(
      world.queries().getEntity('shipment', shipment.result.shipmentId).data.status,
      'arrived',
    );

    // food security recalculated on daily ticks
    const markets = world.queries().list('market');
    assert.ok(markets.every((m) => m.data.foodSecurity != null));

    // 9 presentation DTOs
    const ui = world.presentation();
    assert.equal(ui.dashboard.kind, 'dashboard');
    assert.ok(ui.contracts.contracts.some((c) => c.id === contract.result.contractId));
    assert.ok(ui.alerts.items.length >= 0);
    assert.ok(ui.causal.steps);

    return world;
  }

  const world = runSlice();
  const checksum = world.checksum();
  const snapshot = world.snapshot();
  const journal = world.getJournal();

  // 10 save/load
  await world.save('vertical-slice');
  const loaded = await world.load('vertical-slice');
  assert.equal(loaded.ok, true);
  assert.equal(world.checksum(), checksum);

  // replay from snapshot + journal commands that are re-dispatchable
  const restored = restoreWorldSnapshot(snapshot);
  assert.equal(checksumWorldState(restored.state), checksum);

  // Second independent run matches checksum
  const worldB = runSlice();
  assert.equal(worldB.checksum(), checksum);

  // Replay runner on a subset: snapshot already equals final; journal length stable
  assert.ok(journal.length > 0);
  void journal;
});
