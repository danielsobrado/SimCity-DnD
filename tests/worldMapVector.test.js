import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVectorMapModel,
  createVectorView,
  findVectorMapCell,
  getVectorCellDetails,
  panVectorView,
  presetLayerDefaults,
  screenToVectorSource,
  vectorSemanticVisibility,
  vectorViewBox,
  zoomVectorView,
} from '../src/editor/map/worldMapVector.js';

function createCartography() {
  return {
    width: 100,
    height: 100,
    vertexIds: Uint32Array.from([10, 20, 30, 40]),
    vertexPoints: Float32Array.from([0, 0, 100, 0, 100, 100, 0, 100]),
    cellIds: Uint32Array.from([5, 9]),
    cellCenters: Float32Array.from([66, 33, 33, 66]),
    vertexOffsets: Uint32Array.from([0, 3, 6]),
    cellVertexIds: Uint32Array.from([10, 20, 30, 10, 30, 40]),
    heights: Uint8Array.from([70, 50]),
    biomes: Uint8Array.from([6, 4]),
    features: Uint32Array.from([1, 1]),
    states: Uint32Array.from([1, 2]),
    provinces: Uint32Array.from([10, 20]),
    cultures: Uint32Array.from([3, 4]),
    religions: Uint32Array.from([5, 6]),
    burgs: Uint32Array.from([7, 0]),
  };
}

function createCampaign() {
  return {
    states: [
      { i: 1, name: 'East', fullName: 'Eastern Realm', color: '#cc6666', pole: [70, 30], cells: 8 },
      { i: 2, name: 'West', fullName: 'Western Realm', color: '#66aa66', pole: [30, 70], cells: 8 },
    ],
    provinces: [
      { i: 10, name: 'Eastshire', color: '#dd7777', pole: [70, 30] },
      { i: 20, name: 'Westshire', color: '#77bb77', pole: [30, 70] },
    ],
    cultures: [
      { i: 3, name: 'Easterners', color: '#cc9966', center: 5 },
      { i: 4, name: 'Westerners', color: '#6699cc', center: 9 },
    ],
    religions: [
      { i: 5, name: 'Sun', color: '#eebb55', center: 5 },
      { i: 6, name: 'Moon', color: '#7777bb', center: 9 },
    ],
    routes: [{ i: 1, group: 'roads', points: [[5, 5, 5], [50, 50, 5], [95, 95, 9]] }],
    rivers: [{ i: 2, cells: [5, 9], discharge: 100 }],
  };
}

const baseTerrain = {
  biomes: [
    { sourceId: 4, name: 'Grassland', color: '#c8d68f' },
    { sourceId: 6, name: 'Temperate deciduous forest', color: '#29bc56' },
  ],
};

test('builds grouped SVG layers, shared-edge borders, routes, rivers, and labels', () => {
  const model = createVectorMapModel(createCartography(), createCampaign(), baseTerrain);
  assert.equal(model.fillLayers.political.length, 2);
  assert.equal(model.fillLayers.biomes.length, 2);
  assert.match(model.fillLayers.political[0].d, /^M/);
  assert.match(model.borders.coastline, /M/);
  assert.match(model.borders.primaryByPreset.political, /M/);
  assert.match(model.borders.secondaryByPreset.provinces, /M/);
  assert.equal(model.routes[0].group, 'roads');
  assert.match(model.routes[0].d, /L50 50/);
  assert.equal(model.rivers[0].width > 1, true);
  assert.equal(model.labelSets.political[0].name, 'Eastern Realm');
  assert.equal(model.labelSets.cultures[0].x, 66);
});

test('finds source cells and reports imported contextual details', () => {
  const campaign = createCampaign();
  const model = createVectorMapModel(createCartography(), campaign, baseTerrain);
  const east = findVectorMapCell(model, 80, 20);
  const west = findVectorMapCell(model, 20, 80);
  assert.equal(model.cartography.cellIds[east], 5);
  assert.equal(model.cartography.cellIds[west], 9);
  assert.equal(findVectorMapCell(model, -1, 50), -1);

  assert.deepEqual(getVectorCellDetails(model, east, campaign, baseTerrain), {
    cellId: 5,
    height: 70,
    biome: 'Temperate deciduous forest',
    state: 'East',
    province: 'Eastshire',
    culture: 'Easterners',
    religion: 'Sun',
    burgId: 7,
  });
});

test('zoom remains anchored to the cursor and pan stays inside map bounds', () => {
  const view = createVectorView({
    sourceWidth: 1000,
    sourceHeight: 500,
    viewportWidth: 1000,
    viewportHeight: 500,
  });
  const before = screenToVectorSource(view, 750, 125);
  const zoomed = zoomVectorView(view, 4, 750, 125);
  const after = screenToVectorSource(zoomed, 750, 125);
  assert.ok(Math.abs(before.x - after.x) < 1e-9);
  assert.ok(Math.abs(before.y - after.y) < 1e-9);
  assert.equal(zoomed.zoom, 4);

  const panned = panVectorView(zoomed, -100000, -100000);
  const box = vectorViewBox(panned);
  assert.ok(box.x + box.width <= 1000 + 1e-9);
  assert.ok(box.y + box.height <= 500 + 1e-9);
});

test('preset defaults and semantic detail thresholds are deterministic', () => {
  assert.deepEqual(presetLayerDefaults('political'), {
    borders: true,
    routes: true,
    rivers: true,
    burgs: true,
    labels: true,
    markers: true,
  });
  assert.equal(presetLayerDefaults('biomes').labels, false);
  assert.equal(vectorSemanticVisibility(1).minorBurgs, false);
  assert.equal(vectorSemanticVisibility(2).burgLabels, true);
  assert.equal(vectorSemanticVisibility(64).markers, true);
});
