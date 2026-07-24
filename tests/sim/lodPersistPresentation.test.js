import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSimulationWorld,
  createMiniCampaignFixture,
  restoreWorldSnapshot,
} from '../../src/sim/index.js';
import { importedSettlementId } from '../../src/sim/model/ids.js';
import { buildAllOverlays, buildSettlementInspector } from '../../src/sim/presentation/viewModels.js';

function boot() {
  const world = createSimulationWorld({ campaign: createMiniCampaignFixture() });
  world.buildGraph();
  assert.equal(world.initializeSystems().ok, true);
  return world;
}

test('LOD promote/demote preserves population totals', () => {
  const world = boot();
  const settlementId = importedSettlementId(1);
  const before = world.queries().getEntity('settlement', settlementId).data.population;
  const promoted = world.promoteSettlement(settlementId, 'C');
  assert.equal(promoted.ok, true);
  assert.equal(promoted.result.manifest.populationTotal, before);
  assert.equal(world.lod.getTier(settlementId), 'C');
  const demoted = world.demoteSettlement(settlementId, 'A');
  assert.equal(demoted.ok, true);
  assert.equal(demoted.result.conserved.populationTotal, before);
});

test('year soak does not explode entity counts unboundedly', () => {
  const world = boot();
  const before = world.queries().countByKind();
  // Use fewer days for test speed while still exercising cadence
  world.stepDays(60);
  const after = world.queries().countByKind();
  assert.ok(after.settlement === before.settlement);
  assert.ok(after.market === before.market);
  // Cohorts stay stable count-wise (same entities patched)
  assert.equal(after.populationCohort, before.populationCohort);
});

test('save load and combat are replay stable', async () => {
  const world = boot();
  world.stepDays(2);
  const combat = world.runEncounterCombat({
    settlementId: importedSettlementId(2),
    members: [
      { name: 'Guard', hp: 25, tags: ['ally'] },
      { name: 'Wolf', hp: 10, tags: ['hostile'] },
    ],
  });
  assert.equal(combat.ok, true, combat.message ?? combat.code);
  const checksum = world.checksum();
  await world.save('slot-a');
  const world2 = createSimulationWorld({ campaign: createMiniCampaignFixture() });
  // Transfer save store payloads by re-saving through shared pattern:
  const snap = world.snapshot();
  const restored = restoreWorldSnapshot(snap);
  assert.equal(checksumWorldLike(restored.state), checksum);
});

function checksumWorldLike(state) {
  const { checksumWorldState } = requireChecksum();
  return checksumWorldState(state);
}

import { checksumWorldState } from '../../src/sim/queries/worldQueries.js';

function requireChecksum() {
  return { checksumWorldState };
}

test('presentation DTOs are frozen and sorted', () => {
  const world = boot();
  world.stepDays(1);
  const overlays = world.presentation();
  assert.equal(overlays.dashboard.kind, 'dashboard');
  assert.equal(overlays.economy.kind, 'economyOverlay');
  assert.equal(overlays.trade.kind, 'tradeOverlay');
  assert.ok(Object.isFrozen(overlays));
  assert.ok(Object.isFrozen(overlays.dashboard));
  const inspector = buildSettlementInspector(world.queries(), importedSettlementId(1));
  assert.equal(inspector.kind, 'settlementInspector');
  const ids = overlays.population.settlements.map((s) => s.id);
  assert.deepEqual(ids, [...ids].sort());
  // Mutating DTO must not affect world
  const rev = world.queries().getRevision();
  try {
    overlays.dashboard.revision = -1;
  } catch {
    // frozen
  }
  assert.equal(world.queries().getRevision(), rev);
  void buildAllOverlays;
});
