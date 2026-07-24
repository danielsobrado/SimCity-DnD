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
  assert.equal(world.initializeSystems().ok, true);
  return world;
}

test('factions initialize and make deterministic decisions', () => {
  const world = boot();
  const factions = world.queries().list('faction');
  assert.equal(factions.length, 1);
  world.stepMonths(1);
  const updated = world.queries().list('faction')[0];
  assert.ok(updated.data.lastDecision);
  assert.ok(updated.data.lastDecision.reasonCodes.length > 0);

  const again = createSimulationWorld({ campaign: createMiniCampaignFixture() });
  again.buildGraph();
  again.initializeSystems();
  again.stepMonths(1);
  assert.deepEqual(
    again.queries().list('faction')[0].data.lastDecision.action,
    updated.data.lastDecision.action,
  );
});

test('blocked shipment contract pipeline is deterministic', () => {
  const run = () => {
    const world = boot();
    world.stepDays(1);
    world.setRouteDanger(importedRouteId(1), 0.9);
    world.planShipment({
      originSettlementId: importedSettlementId(1),
      destinationSettlementId: importedSettlementId(2),
      quantity: 5,
    });
    world.detectOpportunities();
    const opportunity = world.queries().list('opportunity')
      .find((o) => o.data.type === 'clear_dangerous_route');
    assert.ok(opportunity);
    const accepted = world.acceptContract(opportunity.id);
    assert.equal(accepted.ok, true);
    const combat = world.runEncounterCombat({
      settlementId: importedSettlementId(1),
      members: [
        { name: 'Hero', role: 'soldier', hp: 30, tags: ['ally'] },
        { name: 'Bandit', role: 'soldier', hp: 12, tags: ['hostile'] },
        { name: 'Bandit 2', role: 'soldier', hp: 12, tags: ['hostile'] },
      ],
    });
    assert.equal(combat.ok, true, combat.message ?? combat.code);
    assert.ok(['victory', 'defeat', 'ongoing'].includes(combat.result.combatResult));
    const resolved = world.resolveContract(accepted.result.contractId, true);
    assert.equal(resolved.ok, true);
    const contract = world.queries().getEntity('contract', accepted.result.contractId);
    assert.equal(contract.data.status, 'completed');
    const route = world.queries().getEntity('route', importedRouteId(1));
    assert.equal(route.data.danger, 0);
    return world.checksum();
  };

  assert.equal(run(), run());
});
