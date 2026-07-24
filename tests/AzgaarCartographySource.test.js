import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AZGAAR_CARTOGRAPHY_KIND,
  createAzgaarCartographySource,
  decodeAzgaarCartographySource,
  isAzgaarCartographySource,
} from '../src/editor/import/AzgaarCartographySource.js';

function createDocument() {
  return {
    info: { width: 1000, height: 800 },
    pack: {
      vertices: [
        { i: 10, p: [0, 0] },
        { i: 20, p: [1000, 0] },
        { i: 30, p: [1000, 800] },
        { i: 40, p: [0, 800] },
      ],
      cells: [
        {
          i: 5,
          p: [666.5, 266.25],
          v: [10, 20, 30],
          h: 72,
          biome: 6,
          f: 3,
          state: 8,
          province: 13,
          culture: 21,
          religion: 34,
          burg: 55,
        },
        {
          i: 9,
          p: [333.25, 533.5],
          v: [10, 30, 40],
          h: 18,
          biome: 0,
          f: 4,
          state: 0,
          province: 0,
          culture: 0,
          religion: 0,
          burg: 0,
        },
      ],
    },
  };
}

test('encodes compact vector cartography and preserves sparse Azgaar ids', () => {
  const source = createAzgaarCartographySource(createDocument());
  assert.equal(source.kind, AZGAAR_CARTOGRAPHY_KIND);
  assert.equal(source.width, 1000);
  assert.equal(source.vertices.count, 4);
  assert.equal(source.cells.count, 2);
  assert.equal(source.cells.vertexReferenceCount, 6);
  assert.equal(isAzgaarCartographySource(source), true);

  const decoded = decodeAzgaarCartographySource(JSON.parse(JSON.stringify(source)));
  assert.deepEqual([...decoded.vertexIds], [10, 20, 30, 40]);
  assert.deepEqual([...decoded.cellIds], [5, 9]);
  assert.deepEqual([...decoded.vertexOffsets], [0, 3, 6]);
  assert.deepEqual([...decoded.cellVertexIds], [10, 20, 30, 10, 30, 40]);
  assert.deepEqual([...decoded.heights], [72, 18]);
  assert.deepEqual([...decoded.biomes], [6, 0]);
  assert.deepEqual([...decoded.features], [3, 4]);
  assert.deepEqual([...decoded.states], [8, 0]);
  assert.deepEqual([...decoded.provinces], [13, 0]);
  assert.deepEqual([...decoded.cultures], [21, 0]);
  assert.deepEqual([...decoded.religions], [34, 0]);
  assert.deepEqual([...decoded.burgs], [55, 0]);
  assert.ok(Math.abs(decoded.cellCenters[0] - 666.5) < 0.01);
});

test('rejects malformed source polygons and missing vertices', () => {
  const malformedPolygon = createDocument();
  malformedPolygon.pack.cells[0].v = [10, 20];
  assert.throws(
    () => createAzgaarCartographySource(malformedPolygon),
    /at least three vertices/,
  );

  const missingVertex = createDocument();
  missingVertex.pack.cells[0].v[2] = 999;
  assert.throws(
    () => createAzgaarCartographySource(missingVertex),
    /missing vertex 999/,
  );
});

test('rejects corrupt encoded payloads during decode', () => {
  const source = createAzgaarCartographySource(createDocument());
  const corrupt = structuredClone(source);
  corrupt.cells.vertexOffsets = corrupt.cells.ids;
  assert.throws(
    () => decodeAzgaarCartographySource(corrupt),
    /vertex offsets/,
  );
});
