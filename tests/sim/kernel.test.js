import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSimulationWorld,
  createMiniCampaignFixture,
  projectAzgaarWorld,
  mergeSimulationConfig,
  validateWorldState,
  checksumWorldState,
  serializeWorldSnapshot,
  restoreWorldSnapshot,
  generatedEntityId,
  createCommandEnvelope,
} from '../../src/sim/index.js';
import { createCommandDispatcher } from '../../src/sim/commands/dispatcher.js';
import { createEmptyWorldState, createAndPutEntity, cloneWorldState } from '../../src/sim/model/worldState.js';
import { importedSettlementId } from '../../src/sim/model/ids.js';
import { createSeededRng } from '../../src/sim/util/seededRng.js';
import { canonicalSerialize, checksumCanonical } from '../../src/sim/persistence/canonicalSerialize.js';
import { createWorldClock, createScheduler, calendarFromTick, ticksPerDay } from '../../src/sim/time/worldClock.js';
import { shortestPath, buildGeographicGraph } from '../../src/sim/geography/geographicGraph.js';
import { validateSimulationConfig } from '../../src/config/validateSimulationConfig.js';
import { validateEditorConfig } from '../../src/config/validateEditorConfig.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('sim modules do not import src/editor', async () => {
  const { execSync } = await import('node:child_process');
  let output = '';
  try {
    output = execSync('rg -n "from [\'\\"].*editor/" src/sim || true', {
      cwd: root,
      encoding: 'utf8',
      shell: true,
    });
  } catch {
    output = '';
  }
  // Fallback without rg
  const { readdirSync, statSync, readFileSync: read } = await import('node:fs');
  function walk(dir, files = []) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, files);
      else if (full.endsWith('.js')) files.push(full);
    }
    return files;
  }
  const offenders = [];
  for (const file of walk(path.join(root, 'src', 'sim'))) {
    const text = read(file, 'utf8');
    if (/from\s+['"][^'"]*editor\//.test(text) || /from\s+['"]\.\.\/editor/.test(text)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
  void output;
});

test('deterministic IDs and seeded RNG', () => {
  const a = generatedEntityId('settlement', 'world', 'cmd-1', 0);
  const b = generatedEntityId('settlement', 'world', 'cmd-1', 0);
  assert.equal(a, b);
  const r1 = createSeededRng(42);
  const r2 = createSeededRng(42);
  assert.equal(r1.nextUint32(), r2.nextUint32());
  assert.notEqual(r1.nextUint32(), createSeededRng(43).nextUint32());
});

test('canonical serialize is key-order independent', () => {
  const a = checksumCanonical({ b: 1, a: 2 });
  const b = checksumCanonical({ a: 2, b: 1 });
  assert.equal(a, b);
  assert.equal(canonicalSerialize({ z: 1, a: [2, 1] }), '{"a":[2,1],"z":1}');
});

test('Azgaar projection is deterministic and validates', () => {
  const campaign = createMiniCampaignFixture();
  const config = mergeSimulationConfig();
  const one = projectAzgaarWorld(campaign, { simulationConfig: config });
  const two = projectAzgaarWorld(campaign, { simulationConfig: config });
  assert.equal(checksumWorldState(one.state), checksumWorldState(two.state));
  assert.equal(one.definition.sourceFingerprint, two.definition.sourceFingerprint);
  assert.equal(one.state.settlements.size, 3);
  assert.equal(one.state.regions.size, 3);
  const validation = validateWorldState(one.state);
  assert.equal(validation.ok, true, JSON.stringify(validation.failures));
});

test('commands are transactional and reject stale revision', () => {
  const state = createEmptyWorldState();
  createAndPutEntity(state, {
    id: 'settlement:azgaar-burg:1',
    kind: 'settlement',
    data: { name: 'A', x: 0, y: 0, regionId: null },
  });
  const dispatcher = createCommandDispatcher();
  const ok = dispatcher.dispatch(state, createCommandEnvelope({
    id: 'c1',
    type: 'sim.patchEntity',
    issuedAtTick: 0,
    payload: {
      kind: 'settlement',
      id: 'settlement:azgaar-burg:1',
      dataPatch: { name: 'B' },
    },
  }));
  assert.equal(ok.ok, true);
  const before = checksumWorldState(state);
  const stale = dispatcher.dispatch(state, createCommandEnvelope({
    id: 'c2',
    type: 'sim.patchEntity',
    issuedAtTick: 0,
    expectedWorldRevision: 999,
    payload: {
      kind: 'settlement',
      id: 'settlement:azgaar-burg:1',
      dataPatch: { name: 'C' },
    },
  }));
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'stale_world_revision');
  assert.equal(checksumWorldState(state), before);
});

test('destroyed entities remain queryable', () => {
  const world = createSimulationWorld({ campaign: createMiniCampaignFixture() });
  const id = importedSettlementId(1);
  const result = world.dispatch('sim.destroyEntity', {
    kind: 'settlement',
    id,
  });
  assert.equal(result.ok, true);
  const entity = world.queries().getEntity('settlement', id);
  assert.equal(entity.status, 'destroyed');
});

test('world clock and scheduler ordering', () => {
  const clock = createWorldClock({ ticksPerHour: 60, hoursPerDay: 24 });
  const scheduler = createScheduler(clock);
  scheduler.scheduleJob({ id: 'b', type: 'x', dueTick: 10, priority: 2, ownerEntityId: 'a' });
  scheduler.scheduleJob({ id: 'a', type: 'x', dueTick: 10, priority: 1, ownerEntityId: 'a' });
  scheduler.scheduleJob({ id: 'c', type: 'x', dueTick: 5, priority: 9, ownerEntityId: 'z' });
  clock.setTick(10);
  const due = scheduler.listDueJobs();
  assert.deepEqual(due.map((j) => j.id), ['c', 'a', 'b']);
  const cal = calendarFromTick(ticksPerDay(clock.getConfig()), clock.getConfig());
  assert.equal(cal.day, clock.getConfig().initialDay + 1);
});

test('geographic graph pathfinding', () => {
  const campaign = createMiniCampaignFixture();
  const { definition, state } = projectAzgaarWorld(campaign, {
    simulationConfig: mergeSimulationConfig(),
  });
  buildGeographicGraph(state, definition, {
    commandId: 'g1',
    config: mergeSimulationConfig(),
  });
  assert.ok(state.graphNodes.size >= 3);
  assert.ok(state.graphEdges.size >= 4);
  const nodes = [...state.graphNodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const harbor = nodes.find((n) => n.data.settlementId === importedSettlementId(1));
  const stone = nodes.find((n) => n.data.settlementId === importedSettlementId(3));
  const path = shortestPath(state, harbor.id, stone.id);
  assert.equal(path.ok, true);
  assert.ok(path.edgeIds.length >= 2);
});

test('simulation config validates in editor.config.yaml', () => {
  const raw = yaml.load(readFileSync(path.join(root, 'editor.config.yaml'), 'utf8'));
  assert.ok(raw.simulation);
  validateSimulationConfig(raw.simulation);
  validateEditorConfig(raw);
});

test('snapshot restore checksum round-trip', () => {
  const world = createSimulationWorld({ campaign: createMiniCampaignFixture() });
  world.buildGraph();
  world.initializeSystems();
  const snap = world.snapshot();
  const restored = restoreWorldSnapshot(snap);
  assert.equal(restored.checksum, snap.snapshotChecksum);
  assert.equal(checksumWorldState(restored.state), checksumWorldState(world.state));
});
