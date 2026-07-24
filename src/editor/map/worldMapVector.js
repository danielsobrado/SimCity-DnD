const LAND_HEIGHT = 20;
const MAX_ZOOM = 64;
const MIN_ZOOM = 1;

export const WORLD_MAP_PRESETS = Object.freeze([
  Object.freeze({ id: 'political', label: 'Political' }),
  Object.freeze({ id: 'provinces', label: 'Provinces' }),
  Object.freeze({ id: 'cultures', label: 'Cultures' }),
  Object.freeze({ id: 'religions', label: 'Religions' }),
  Object.freeze({ id: 'biomes', label: 'Biomes' }),
  Object.freeze({ id: 'heightmap', label: 'Heightmap' }),
  Object.freeze({ id: 'physical', label: 'Physical' }),
]);

export const WORLD_MAP_LAYER_TOGGLES = Object.freeze([
  Object.freeze({ id: 'borders', label: 'Borders' }),
  Object.freeze({ id: 'routes', label: 'Routes' }),
  Object.freeze({ id: 'rivers', label: 'Rivers' }),
  Object.freeze({ id: 'burgs', label: 'Burgs' }),
  Object.freeze({ id: 'labels', label: 'Labels' }),
  Object.freeze({ id: 'markers', label: 'Markers' }),
]);

export const DEFAULT_WORLD_MAP_PRESET = 'political';

const PRESET_DEFAULTS = Object.freeze({
  political: Object.freeze({
    borders: true, routes: true, rivers: true, burgs: true, labels: true, markers: true,
  }),
  provinces: Object.freeze({
    borders: true, routes: true, rivers: true, burgs: true, labels: true, markers: false,
  }),
  cultures: Object.freeze({
    borders: true, routes: false, rivers: true, burgs: true, labels: true, markers: false,
  }),
  religions: Object.freeze({
    borders: true, routes: false, rivers: true, burgs: true, labels: true, markers: false,
  }),
  biomes: Object.freeze({
    borders: false, routes: false, rivers: true, burgs: false, labels: false, markers: false,
  }),
  heightmap: Object.freeze({
    borders: false, routes: false, rivers: true, burgs: false, labels: false, markers: false,
  }),
  physical: Object.freeze({
    borders: false, routes: true, rivers: true, burgs: true, labels: true, markers: true,
  }),
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatCoordinate(value) {
  return Number(value.toFixed(2)).toString();
}

function pathMoveLine(ax, ay, bx, by) {
  return `M${formatCoordinate(ax)} ${formatCoordinate(ay)}L${formatCoordinate(bx)} ${formatCoordinate(by)}`;
}

function pointPath(points, close = false) {
  if (points.length === 0) return '';
  let result = `M${formatCoordinate(points[0][0])} ${formatCoordinate(points[0][1])}`;
  for (let index = 1; index < points.length; index += 1) {
    result += `L${formatCoordinate(points[index][0])} ${formatCoordinate(points[index][1])}`;
  }
  return close ? `${result}Z` : result;
}

function parseHexColor(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value ?? ''));
  if (!match) return null;
  const numeric = Number.parseInt(match[1], 16);
  return [
    (numeric >> 16) & 0xff,
    (numeric >> 8) & 0xff,
    numeric & 0xff,
  ];
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function mixMapColor(color, target, amount) {
  const sourceRgb = parseHexColor(color) ?? [168, 165, 145];
  const targetRgb = parseHexColor(target) ?? [255, 255, 255];
  return rgbToHex(
    sourceRgb[0] + (targetRgb[0] - sourceRgb[0]) * amount,
    sourceRgb[1] + (targetRgb[1] - sourceRgb[1]) * amount,
    sourceRgb[2] + (targetRgb[2] - sourceRgb[2]) * amount,
  );
}

function interpolateColor(stops, amount) {
  const normalized = clamp(amount, 0, 1) * (stops.length - 1);
  const leftIndex = Math.floor(normalized);
  const rightIndex = Math.min(stops.length - 1, leftIndex + 1);
  const local = normalized - leftIndex;
  const left = parseHexColor(stops[leftIndex]);
  const right = parseHexColor(stops[rightIndex]);
  return rgbToHex(
    left[0] + (right[0] - left[0]) * local,
    left[1] + (right[1] - left[1]) * local,
    left[2] + (right[2] - left[2]) * local,
  );
}

function entityMap(entities) {
  return new Map((entities ?? [])
    .filter((entity) => Number.isInteger(Number(entity?.i)))
    .map((entity) => [Number(entity.i), entity]));
}

function addGroupedPath(groups, key, color, path) {
  const existing = groups.get(key);
  if (existing) {
    existing.d += path;
  } else {
    groups.set(key, { id: String(key), color, d: path });
  }
}

function createVertexLookup(cartography) {
  const result = new Map();
  for (let index = 0; index < cartography.vertexIds.length; index += 1) {
    result.set(cartography.vertexIds[index], index);
  }
  return result;
}

function cellPoints(cartography, vertexIndexById, cellIndex) {
  const start = cartography.vertexOffsets[cellIndex];
  const end = cartography.vertexOffsets[cellIndex + 1];
  const result = [];
  for (let offset = start; offset < end; offset += 1) {
    const vertexId = cartography.cellVertexIds[offset];
    const vertexIndex = vertexIndexById.get(vertexId);
    result.push([
      cartography.vertexPoints[vertexIndex * 2],
      cartography.vertexPoints[vertexIndex * 2 + 1],
    ]);
  }
  return result;
}

function buildCellGeometry(cartography, vertexIndexById) {
  const paths = new Array(cartography.cellIds.length);
  const points = new Array(cartography.cellIds.length);
  for (let cellIndex = 0; cellIndex < cartography.cellIds.length; cellIndex += 1) {
    const polygon = cellPoints(cartography, vertexIndexById, cellIndex);
    points[cellIndex] = polygon;
    paths[cellIndex] = pointPath(polygon, true);
  }
  return Object.freeze({ paths, points });
}

function waterColor(height, physical = false) {
  const depth = clamp(height / Math.max(1, LAND_HEIGHT - 1), 0, 1);
  return interpolateColor(
    physical ? ['#75abc2', '#a8ccda'] : ['#84b4c8', '#b9d7df'],
    depth,
  );
}

function heightColor(height) {
  if (height < LAND_HEIGHT) return waterColor(height);
  return interpolateColor(
    ['#d8d9a9', '#c8d29c', '#d6c89b', '#c5b28d', '#b7a69a', '#e6e2dc'],
    (height - LAND_HEIGHT) / (100 - LAND_HEIGHT),
  );
}

function physicalColor(height) {
  if (height < LAND_HEIGHT) return waterColor(height, true);
  return interpolateColor(
    ['#b8c98b', '#d0cd96', '#c8b184', '#ac9076', '#dad4c9', '#f2f1ed'],
    (height - LAND_HEIGHT) / (100 - LAND_HEIGHT),
  );
}

function presetCellStyle(preset, cellIndex, context) {
  const {
    cartography,
    stateById,
    provinceById,
    cultureById,
    religionById,
    biomeById,
  } = context;
  const height = cartography.heights[cellIndex];
  if (height < LAND_HEIGHT) {
    if (preset !== 'heightmap' && preset !== 'physical') {
      return { key: 'water', color: '#9fc8d8' };
    }
    const band = Math.floor(height / 4);
    return { key: `water-${band}`, color: waterColor(height, preset === 'physical') };
  }

  if (preset === 'political') {
    const id = cartography.states[cellIndex];
    const entity = stateById.get(id);
    return {
      key: `state-${id}`,
      color: entity ? mixMapColor(entity.color, '#fff5dc', 0.35) : '#e6e1cc',
    };
  }
  if (preset === 'provinces') {
    const provinceId = cartography.provinces[cellIndex];
    const province = provinceById.get(provinceId);
    if (province) {
      return {
        key: `province-${provinceId}`,
        color: mixMapColor(province.color, '#fff5dc', 0.28),
      };
    }
    const stateId = cartography.states[cellIndex];
    const state = stateById.get(stateId);
    return {
      key: `state-fallback-${stateId}`,
      color: state ? mixMapColor(state.color, '#eee7d2', 0.68) : '#e6e1cc',
    };
  }
  if (preset === 'cultures') {
    const id = cartography.cultures[cellIndex];
    const entity = cultureById.get(id);
    return {
      key: `culture-${id}`,
      color: entity ? mixMapColor(entity.color, '#fff5dc', 0.34) : '#e6e1cc',
    };
  }
  if (preset === 'religions') {
    const id = cartography.religions[cellIndex];
    const entity = religionById.get(id);
    return {
      key: `religion-${id}`,
      color: entity ? mixMapColor(entity.color, '#fff5dc', 0.38) : '#e6e1cc',
    };
  }
  if (preset === 'biomes') {
    const id = cartography.biomes[cellIndex];
    const biome = biomeById.get(id);
    return {
      key: `biome-${id}`,
      color: biome ? mixMapColor(biome.color, '#fff7df', 0.12) : '#aaa990',
    };
  }
  if (preset === 'heightmap') {
    const band = Math.floor(height / 4);
    return { key: `height-${band}`, color: heightColor(band * 4 + 2) };
  }
  const band = Math.floor(height / 4);
  return { key: `physical-${band}`, color: physicalColor(band * 4 + 2) };
}

function borderValuesForPreset(preset, cartography, cellIndex) {
  if (preset === 'political') return [cartography.states[cellIndex], 0];
  if (preset === 'provinces') {
    return [cartography.states[cellIndex], cartography.provinces[cellIndex]];
  }
  if (preset === 'cultures') return [cartography.cultures[cellIndex], 0];
  if (preset === 'religions') return [cartography.religions[cellIndex], 0];
  if (preset === 'biomes') return [cartography.biomes[cellIndex], 0];
  return [0, 0];
}

function buildFillLayers(cartography, geometry, campaign, baseTerrain) {
  const context = {
    cartography,
    stateById: entityMap(campaign.states),
    provinceById: entityMap(campaign.provinces),
    cultureById: entityMap(campaign.cultures),
    religionById: entityMap(campaign.religions),
    biomeById: new Map((baseTerrain?.biomes ?? []).map((biome) => [biome.sourceId, biome])),
  };
  const result = {};
  for (const preset of WORLD_MAP_PRESETS) {
    const groups = new Map();
    for (let cellIndex = 0; cellIndex < cartography.cellIds.length; cellIndex += 1) {
      const style = presetCellStyle(preset.id, cellIndex, context);
      addGroupedPath(groups, style.key, style.color, geometry.paths[cellIndex]);
    }
    result[preset.id] = Object.freeze([...groups.values()].map(Object.freeze));
  }
  return Object.freeze(result);
}

function buildBorders(cartography, vertexIndexById) {
  const edges = new Map();
  for (let cellIndex = 0; cellIndex < cartography.cellIds.length; cellIndex += 1) {
    const start = cartography.vertexOffsets[cellIndex];
    const end = cartography.vertexOffsets[cellIndex + 1];
    for (let offset = start; offset < end; offset += 1) {
      const left = cartography.cellVertexIds[offset];
      const right = cartography.cellVertexIds[offset + 1 < end ? offset + 1 : start];
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      const edge = edges.get(key);
      if (edge) {
        edge.rightCell = cellIndex;
      } else {
        edges.set(key, { leftVertex: left, rightVertex: right, leftCell: cellIndex });
      }
    }
  }

  const primaryByPreset = Object.fromEntries(WORLD_MAP_PRESETS.map(({ id }) => [id, '']));
  const secondaryByPreset = Object.fromEntries(WORLD_MAP_PRESETS.map(({ id }) => [id, '']));
  let coastline = '';

  for (const edge of edges.values()) {
    const leftVertexIndex = vertexIndexById.get(edge.leftVertex);
    const rightVertexIndex = vertexIndexById.get(edge.rightVertex);
    const ax = cartography.vertexPoints[leftVertexIndex * 2];
    const ay = cartography.vertexPoints[leftVertexIndex * 2 + 1];
    const bx = cartography.vertexPoints[rightVertexIndex * 2];
    const by = cartography.vertexPoints[rightVertexIndex * 2 + 1];
    const segment = pathMoveLine(ax, ay, bx, by);
    const leftLand = cartography.heights[edge.leftCell] >= LAND_HEIGHT;
    const rightLand = edge.rightCell === undefined
      ? false
      : cartography.heights[edge.rightCell] >= LAND_HEIGHT;
    if (leftLand !== rightLand) {
      coastline += segment;
      continue;
    }
    if (!leftLand || edge.rightCell === undefined) continue;

    for (const preset of WORLD_MAP_PRESETS) {
      const left = borderValuesForPreset(preset.id, cartography, edge.leftCell);
      const right = borderValuesForPreset(preset.id, cartography, edge.rightCell);
      if (left[0] !== right[0]) primaryByPreset[preset.id] += segment;
      if (left[1] !== right[1]) secondaryByPreset[preset.id] += segment;
    }
  }

  return Object.freeze({
    coastline,
    primaryByPreset: Object.freeze(primaryByPreset),
    secondaryByPreset: Object.freeze(secondaryByPreset),
  });
}

function cellPointById(cartography) {
  const result = new Map();
  for (let index = 0; index < cartography.cellIds.length; index += 1) {
    result.set(cartography.cellIds[index], [
      cartography.cellCenters[index * 2],
      cartography.cellCenters[index * 2 + 1],
    ]);
  }
  return result;
}

function buildRoutes(campaign) {
  return Object.freeze((campaign.routes ?? []).flatMap((route) => {
    const points = (route.points ?? []).flatMap((point) => (
      Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
        ? [[Number(point[0]), Number(point[1])]]
        : []
    ));
    if (points.length < 2) return [];
    return [Object.freeze({
      id: route.i,
      group: String(route.group ?? 'roads'),
      d: pointPath(points),
    })];
  }));
}

function buildRivers(campaign, centerByCellId) {
  return Object.freeze((campaign.rivers ?? []).flatMap((river) => {
    const sourcePoints = Array.isArray(river.points) && river.points.length > 1
      ? river.points
      : (river.cells ?? []).map((cellId) => centerByCellId.get(Number(cellId))).filter(Boolean);
    const points = sourcePoints.flatMap((point) => (
      Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
        ? [[Number(point[0]), Number(point[1])]]
        : []
    ));
    if (points.length < 2) return [];
    const discharge = Math.max(0, Number(river.discharge ?? 0));
    const width = clamp(0.7 + Math.sqrt(discharge) * 0.055, 0.7, 4.5);
    return [Object.freeze({ id: river.i, d: pointPath(points), width })];
  }));
}

function pointForEntity(entity, centerByCellId) {
  if (Array.isArray(entity?.pole)
      && Number.isFinite(Number(entity.pole[0])) && Number.isFinite(Number(entity.pole[1]))) {
    return [Number(entity.pole[0]), Number(entity.pole[1])];
  }
  return centerByCellId.get(Number(entity?.center)) ?? null;
}

function createLabel(entity, kind, centerByCellId) {
  const point = pointForEntity(entity, centerByCellId);
  if (!point || entity?.removed) return null;
  const cellCount = Math.max(1, Number(entity.cells ?? 1));
  const importance = kind === 'province'
    ? clamp(Math.sqrt(cellCount) / 4, 0.8, 1.5)
    : clamp(Math.sqrt(cellCount) / 12, 1, 2.3);
  return Object.freeze({
    id: entity.i,
    kind,
    name: String(entity.fullName ?? entity.name ?? ''),
    x: point[0],
    y: point[1],
    importance,
  });
}

function buildLabelSets(campaign, centerByCellId) {
  const build = (items, kind) => Object.freeze((items ?? [])
    .map((entity) => createLabel(entity, kind, centerByCellId))
    .filter((label) => label?.name));
  const states = build(campaign.states, 'state');
  return Object.freeze({
    political: states,
    provinces: build(campaign.provinces, 'province'),
    cultures: build(campaign.cultures, 'culture'),
    religions: build(campaign.religions, 'religion'),
    biomes: Object.freeze([]),
    heightmap: Object.freeze([]),
    physical: states,
  });
}

function buildSpatialIndex(cartography, geometry) {
  const aspect = cartography.width / cartography.height;
  const columns = clamp(Math.ceil(Math.sqrt(cartography.cellIds.length * aspect)), 8, 256);
  const rows = clamp(Math.ceil(columns / aspect), 8, 256);
  const buckets = Array.from({ length: columns * rows }, () => []);
  const pointsByCell = geometry.points;

  for (let cellIndex = 0; cellIndex < cartography.cellIds.length; cellIndex += 1) {
    const points = pointsByCell[cellIndex];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const startColumn = clamp(Math.floor(minX / cartography.width * columns), 0, columns - 1);
    const endColumn = clamp(Math.floor(maxX / cartography.width * columns), 0, columns - 1);
    const startRow = clamp(Math.floor(minY / cartography.height * rows), 0, rows - 1);
    const endRow = clamp(Math.floor(maxY / cartography.height * rows), 0, rows - 1);
    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        buckets[row * columns + column].push(cellIndex);
      }
    }
  }
  return Object.freeze({ columns, rows, buckets, pointsByCell });
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const xi = points[index][0];
    const yi = points[index][1];
    const xj = points[previous][0];
    const yj = points[previous][1];
    const intersects = ((yi > y) !== (yj > y))
      && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function findVectorMapCell(model, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)
      || x < 0 || y < 0 || x > model.width || y > model.height) {
    return -1;
  }
  const { spatialIndex } = model;
  const column = clamp(Math.floor(x / model.width * spatialIndex.columns), 0, spatialIndex.columns - 1);
  const row = clamp(Math.floor(y / model.height * spatialIndex.rows), 0, spatialIndex.rows - 1);
  for (const cellIndex of spatialIndex.buckets[row * spatialIndex.columns + column]) {
    if (pointInPolygon(x, y, spatialIndex.pointsByCell[cellIndex])) return cellIndex;
  }
  return -1;
}

export function createVectorMapModel(cartography, campaign, baseTerrain) {
  const vertexIndexById = createVertexLookup(cartography);
  const geometry = buildCellGeometry(cartography, vertexIndexById);
  const lookups = Object.freeze({
    stateById: entityMap(campaign.states),
    provinceById: entityMap(campaign.provinces),
    cultureById: entityMap(campaign.cultures),
    religionById: entityMap(campaign.religions),
    biomeById: new Map((baseTerrain?.biomes ?? []).map((biome) => [biome.sourceId, biome])),
  });
  const centerByCellId = cellPointById(cartography);
  const cellIndexById = new Map();
  for (let index = 0; index < cartography.cellIds.length; index += 1) {
    cellIndexById.set(cartography.cellIds[index], index);
  }
  return Object.freeze({
    width: cartography.width,
    height: cartography.height,
    cartography,
    vertexIndexById,
    cellIndexById,
    centerByCellId,
    lookups,
    fillLayers: buildFillLayers(cartography, geometry, campaign, baseTerrain),
    borders: buildBorders(cartography, vertexIndexById),
    routes: buildRoutes(campaign),
    rivers: buildRivers(campaign, centerByCellId),
    labelSets: buildLabelSets(campaign, centerByCellId),
    spatialIndex: buildSpatialIndex(cartography, geometry),
  });
}

export function getVectorCellDetails(model, cellIndex, campaign, baseTerrain) {
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= model.cartography.cellIds.length) {
    return null;
  }
  const stateById = model.lookups?.stateById ?? entityMap(campaign.states);
  const provinceById = model.lookups?.provinceById ?? entityMap(campaign.provinces);
  const cultureById = model.lookups?.cultureById ?? entityMap(campaign.cultures);
  const religionById = model.lookups?.religionById ?? entityMap(campaign.religions);
  const biomeById = model.lookups?.biomeById
    ?? new Map((baseTerrain?.biomes ?? []).map((biome) => [biome.sourceId, biome]));
  const { cartography } = model;
  return Object.freeze({
    cellId: cartography.cellIds[cellIndex],
    height: cartography.heights[cellIndex],
    biome: biomeById.get(cartography.biomes[cellIndex])?.name ?? 'Unknown biome',
    state: stateById.get(cartography.states[cellIndex])?.name ?? null,
    province: provinceById.get(cartography.provinces[cellIndex])?.name ?? null,
    culture: cultureById.get(cartography.cultures[cellIndex])?.name ?? null,
    religion: religionById.get(cartography.religions[cellIndex])?.name ?? null,
    burgId: cartography.burgs[cellIndex] || null,
  });
}

export function presetLayerDefaults(presetId) {
  return { ...(PRESET_DEFAULTS[presetId] ?? PRESET_DEFAULTS[DEFAULT_WORLD_MAP_PRESET]) };
}

export function createVectorView({
  sourceWidth,
  sourceHeight,
  viewportWidth,
  viewportHeight,
  centerX = sourceWidth / 2,
  centerY = sourceHeight / 2,
  zoom = 1,
}) {
  const view = {
    sourceWidth,
    sourceHeight,
    viewportWidth: Math.max(1, viewportWidth),
    viewportHeight: Math.max(1, viewportHeight),
    centerX,
    centerY,
    zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM),
  };
  return clampVectorView(view);
}

function baseVectorExtent(view) {
  const sourceAspect = view.sourceWidth / view.sourceHeight;
  const viewportAspect = view.viewportWidth / view.viewportHeight;
  if (viewportAspect >= sourceAspect) {
    return {
      width: view.sourceHeight * viewportAspect,
      height: view.sourceHeight,
    };
  }
  return {
    width: view.sourceWidth,
    height: view.sourceWidth / viewportAspect,
  };
}

export function vectorViewBox(view) {
  const base = baseVectorExtent(view);
  const width = base.width / view.zoom;
  const height = base.height / view.zoom;
  return Object.freeze({
    x: view.centerX - width / 2,
    y: view.centerY - height / 2,
    width,
    height,
  });
}

export function clampVectorView(view) {
  const result = { ...view, zoom: clamp(view.zoom, MIN_ZOOM, MAX_ZOOM) };
  const box = vectorViewBox(result);
  result.centerX = box.width >= result.sourceWidth
    ? result.sourceWidth / 2
    : clamp(result.centerX, box.width / 2, result.sourceWidth - box.width / 2);
  result.centerY = box.height >= result.sourceHeight
    ? result.sourceHeight / 2
    : clamp(result.centerY, box.height / 2, result.sourceHeight - box.height / 2);
  return result;
}

export function screenToVectorSource(view, screenX, screenY) {
  const box = vectorViewBox(view);
  return Object.freeze({
    x: box.x + screenX / view.viewportWidth * box.width,
    y: box.y + screenY / view.viewportHeight * box.height,
  });
}

export function zoomVectorView(view, factor, screenX, screenY) {
  const before = screenToVectorSource(view, screenX, screenY);
  const zoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const next = { ...view, zoom };
  const box = vectorViewBox(next);
  const fractionX = screenX / view.viewportWidth;
  const fractionY = screenY / view.viewportHeight;
  next.centerX = before.x - fractionX * box.width + box.width / 2;
  next.centerY = before.y - fractionY * box.height + box.height / 2;
  return clampVectorView(next);
}

export function panVectorView(view, deltaScreenX, deltaScreenY) {
  const box = vectorViewBox(view);
  return clampVectorView({
    ...view,
    centerX: view.centerX - deltaScreenX / view.viewportWidth * box.width,
    centerY: view.centerY - deltaScreenY / view.viewportHeight * box.height,
  });
}

export function resizeVectorView(view, viewportWidth, viewportHeight) {
  return clampVectorView({
    ...view,
    viewportWidth: Math.max(1, viewportWidth),
    viewportHeight: Math.max(1, viewportHeight),
  });
}

export function vectorSemanticVisibility(zoom) {
  return Object.freeze({
    minorBurgs: zoom >= 1.35,
    burgLabels: zoom >= 2,
    markers: zoom >= 1.4,
    cellDetails: zoom >= 1,
  });
}

export const WORLD_MAP_MAX_ZOOM = MAX_ZOOM;
