import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { normalizeProceduralRecipe } from './ProceduralAssetStore.js';
import {
  archedPanel,
  beveledBox,
  coneRoof,
  cylinder,
  flagGeometry,
  leaf,
  wallRoofPlanes,
} from './ProceduralWorkshopGeometry.js';
import {
  applyStoneColor,
  createWorkshopMaterials,
} from './ProceduralWorkshopMaterials.js';
import { createRandom, mixSeed } from './ProceduralRandom.js';

const TAU = Math.PI * 2;

function shortAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function openingHalfWidth(opening, y) {
  const localY = y - opening.bottom;
  if (localY < 0 || localY > opening.springHeight + opening.radius) return 0;
  if (localY <= opening.springHeight) return opening.width / 2;
  const archY = localY - opening.springHeight;
  return Math.sqrt(Math.max(0, opening.radius ** 2 - archY ** 2));
}

function isInsideOpening(opening, x, y, stoneHalfWidth = 0) {
  const halfWidth = openingHalfWidth(opening, y);
  return halfWidth > 0 && Math.abs(x - opening.centerX) < halfWidth + stoneHalfWidth * 0.35;
}

function addStone(target, recipe, params, stableIndex, heightRatio) {
  target.push(applyStoneColor(
    beveledBox({ ...params, detail: recipe.detail }),
    recipe,
    stableIndex,
    heightRatio,
  ));
}

function buildWallCourses(recipe, {
  width = recipe.width,
  depth = recipe.depth,
  height = recipe.height,
  centerX = 0,
  centerZ = 0,
  openings = [],
  seedOffset = 0,
  yaw = 0,
} = {}) {
  const random = createRandom(mixSeed(recipe.seed, seedOffset));
  const geometries = [];
  const courseHeight = 0.5 - recipe.detail * 0.045;
  const courses = Math.max(2, Math.ceil(height / courseHeight));
  const actualCourseHeight = height / courses;
  const targetStoneWidth = 0.94 - recipe.detail * 0.08;
  let stableIndex = seedOffset * 10000;

  for (let course = 0; course < courses; course += 1) {
    const y = (course + 0.5) * actualCourseHeight;
    let cursor = -width / 2;
    let stoneIndex = 0;
    while (cursor < width / 2 - 0.001) {
      const remaining = width / 2 - cursor;
      const desired = targetStoneWidth * (0.72 + random() * 0.56);
      const stoneWidth = Math.min(remaining, Math.max(0.28, desired));
      const stoneCenter = cursor + stoneWidth / 2;
      const insideOpening = openings.some((opening) => (
        isInsideOpening(opening, stoneCenter, y, stoneWidth / 2)
      ));
      if (!insideOpening) {
        const inset = 0.014 + random() * 0.016;
        const localX = stoneCenter;
        addStone(geometries, recipe, {
          width: Math.max(0.12, stoneWidth - inset),
          height: Math.max(0.12, actualCourseHeight - inset * 0.72),
          depth: depth * (0.96 + random() * 0.025),
          position: [
            centerX + Math.cos(yaw) * localX,
            y + (random() - 0.5) * 0.028,
            centerZ - Math.sin(yaw) * localX,
          ],
          rotation: [0, yaw + (random() - 0.5) * 0.012, 0],
        }, stableIndex, y / height);
      }
      cursor += stoneWidth;
      stoneIndex += 1;
      stableIndex += 1;
      if (stoneIndex > 256) {
        throw new Error('Workshop stone packing exceeded its safety budget.');
      }
    }
  }
  return geometries;
}

function buildArchTrim(recipe, opening, {
  frontZ,
  seedOffset,
  depth = 0.3,
}) {
  const stones = [];
  const blockHeight = 0.32;
  const jambCourses = Math.max(2, Math.ceil(opening.springHeight / blockHeight));
  const actualJambHeight = opening.springHeight / jambCourses;
  const trimThickness = Math.max(0.2, opening.width * 0.11);
  let stableIndex = seedOffset * 10000;

  for (let course = 0; course < jambCourses; course += 1) {
    const y = opening.bottom + (course + 0.5) * actualJambHeight;
    for (const side of [-1, 1]) {
      addStone(stones, recipe, {
        width: trimThickness,
        height: actualJambHeight * 0.91,
        depth,
        position: [
          opening.centerX + side * (opening.width / 2 + trimThickness * 0.48),
          y,
          frontZ,
        ],
      }, stableIndex, y / recipe.height);
      stableIndex += 1;
    }
  }

  const archBlocks = Math.max(7, Math.ceil(Math.PI * opening.radius / 0.3));
  for (let block = 0; block < archBlocks; block += 1) {
    const angle = (block + 0.5) / archBlocks * Math.PI;
    const ringRadius = opening.radius + trimThickness * 0.5;
    const x = opening.centerX + Math.cos(angle) * ringRadius;
    const y = opening.bottom + opening.springHeight + Math.sin(angle) * ringRadius;
    addStone(stones, recipe, {
      width: Math.PI * ringRadius / archBlocks * 0.92,
      height: trimThickness,
      depth,
      position: [x, y, frontZ],
      rotation: [0, 0, angle - Math.PI / 2],
    }, stableIndex, y / recipe.height);
    stableIndex += 1;
  }
  return stones;
}

function addOpeningDetails(sets, recipe, opening, {
  frontZ,
  seedOffset,
  door = false,
}) {
  sets.stone.push(...buildArchTrim(recipe, opening, { frontZ, seedOffset }));
  const panel = archedPanel({
    width: opening.width * 0.91,
    springHeight: opening.springHeight,
    radius: opening.radius * 0.91,
    depth: 0.12,
    position: [opening.centerX, opening.bottom, frontZ - 0.11],
    detail: recipe.detail,
  });
  if (door) {
    sets.wood.push(panel);
    const plankCount = Math.max(3, Math.round(opening.width / 0.32));
    for (let index = 1; index < plankCount; index += 1) {
      const x = opening.centerX - opening.width * 0.455 + index * opening.width * 0.91 / plankCount;
      sets.metal.push(beveledBox({
        width: 0.018,
        height: opening.springHeight * 0.92,
        depth: 0.025,
        position: [x, opening.bottom + opening.springHeight * 0.46, frontZ - 0.035],
        detail: 1,
        bevelRatio: 0.05,
      }));
    }
    for (const y of [0.35, opening.springHeight * 0.72]) {
      sets.metal.push(beveledBox({
        width: opening.width * 0.83,
        height: 0.055,
        depth: 0.035,
        position: [opening.centerX, opening.bottom + y, frontZ - 0.03],
        detail: 1,
        bevelRatio: 0.08,
      }));
    }
  } else {
    sets.recess.push(panel);
    sets.wood.push(beveledBox({
      width: 0.055,
      height: opening.springHeight * 0.8,
      depth: 0.05,
      position: [
        opening.centerX,
        opening.bottom + opening.springHeight * 0.47,
        frontZ - 0.02,
      ],
      detail: 1,
      bevelRatio: 0.08,
    }));
  }
}

function buildBattlementLine(sets, recipe, {
  width,
  depth,
  y,
  centerX = 0,
  centerZ = 0,
  seedOffset,
  yaw = 0,
}) {
  const merlons = Math.max(3, Math.ceil(width / 1.25));
  const spacing = width / merlons;
  let stableIndex = seedOffset * 10000;
  for (let index = 0; index < merlons; index += 1) {
    const localX = -width / 2 + spacing * (index + 0.5);
    addStone(sets.stone, recipe, {
      width: Math.min(0.62, spacing * 0.58),
      height: 0.62,
      depth: depth + 0.2,
      position: [
        centerX + Math.cos(yaw) * localX,
        y + 0.31,
        centerZ - Math.sin(yaw) * localX,
      ],
      rotation: [0, yaw, 0],
    }, stableIndex + index, 1);
  }
  const coping = Math.max(2, Math.ceil(width / 0.7));
  for (let index = 0; index < coping; index += 1) {
    const stoneWidth = width / coping;
    const localX = -width / 2 + stoneWidth * (index + 0.5);
    addStone(sets.stone, recipe, {
      width: stoneWidth * 0.96,
      height: 0.18,
      depth: depth + 0.28,
      position: [
        centerX + Math.cos(yaw) * localX,
        y - 0.09,
        centerZ - Math.sin(yaw) * localX,
      ],
      rotation: [0, yaw, 0],
    }, stableIndex + merlons + index, 1);
  }
}

function towerOpeningAt(opening, angle, radius, y, blockHalfWidth) {
  const tangential = shortAngle(angle - opening.angle) * radius;
  return isInsideOpening(
    { ...opening, centerX: 0 },
    tangential,
    y,
    blockHalfWidth,
  );
}

function buildTowerBody(recipe, {
  radius,
  depth,
  height,
  centerX = 0,
  centerZ = 0,
  seedOffset,
  openings = [],
}) {
  const random = createRandom(mixSeed(recipe.seed, seedOffset));
  const stones = [];
  const courseHeight = 0.5 - recipe.detail * 0.04;
  const courses = Math.max(3, Math.ceil(height / courseHeight));
  const actualHeight = height / courses;
  const circumference = TAU * radius;
  const blocks = Math.max(12, Math.ceil(circumference / (0.82 - recipe.detail * 0.06)));
  let stableIndex = seedOffset * 10000;

  for (let course = 0; course < courses; course += 1) {
    const phase = (course % 2) * Math.PI / blocks;
    const y = (course + 0.5) * actualHeight;
    for (let block = 0; block < blocks; block += 1) {
      const angle = phase + block / blocks * TAU;
      const blockWidth = circumference / blocks * 0.94;
      if (!openings.some((opening) => (
        towerOpeningAt(opening, angle, radius, y, blockWidth / 2)
      ))) {
        addStone(stones, recipe, {
          width: blockWidth * 1.035,
          height: actualHeight * 0.975,
          depth,
          position: [
            centerX + Math.sin(angle) * radius,
            y + (random() - 0.5) * 0.018,
            centerZ + Math.cos(angle) * radius,
          ],
          rotation: [0, angle, 0],
        }, stableIndex, y / height);
      }
      stableIndex += 1;
    }
  }
  return stones;
}

function buildRoundBattlements(sets, recipe, {
  radius,
  depth,
  height,
  centerX,
  centerZ,
  seedOffset,
}) {
  const count = Math.max(10, Math.ceil(TAU * radius / 1.05));
  let stableIndex = seedOffset * 10000;
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * TAU;
    addStone(sets.stone, recipe, {
      width: TAU * radius / count * 0.58,
      height: 0.66,
      depth: depth * 1.12,
      position: [
        centerX + Math.sin(angle) * (radius + depth * 0.08),
        height + 0.33,
        centerZ + Math.cos(angle) * (radius + depth * 0.08),
      ],
      rotation: [0, angle, 0],
    }, stableIndex + index, 1);
  }
  for (let index = 0; index < count * 2; index += 1) {
    const angle = index / (count * 2) * TAU;
    addStone(sets.stone, recipe, {
      width: TAU * radius / (count * 2) * 0.92,
      height: 0.18,
      depth: depth * 1.22,
      position: [
        centerX + Math.sin(angle) * (radius + depth * 0.1),
        height - 0.08,
        centerZ + Math.cos(angle) * (radius + depth * 0.1),
      ],
      rotation: [0, angle, 0],
    }, stableIndex + count + index, 1);
  }
}

function buildMachicolations(sets, recipe, {
  radius,
  depth,
  height,
  centerX,
  centerZ,
  seedOffset,
}) {
  const count = Math.max(12, Math.ceil(TAU * radius / 0.78));
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * TAU;
    addStone(sets.stone, recipe, {
      width: 0.3,
      height: 0.42,
      depth: 0.55,
      position: [
        centerX + Math.sin(angle) * (radius + depth * 0.46),
        height - 0.18,
        centerZ + Math.cos(angle) * (radius + depth * 0.46),
      ],
      rotation: [0, angle, 0],
    }, seedOffset * 10000 + index, 0.96);
  }
}

function addTowerTop(sets, recipe, {
  radius,
  depth,
  height,
  centerX,
  centerZ,
  seedOffset,
}) {
  buildMachicolations(sets, recipe, {
    radius,
    depth,
    height,
    centerX,
    centerZ,
    seedOffset: seedOffset + 10,
  });
  let flagBase = height + 0.7;
  if (recipe.topStyle === 'battlements') {
    buildRoundBattlements(sets, recipe, {
      radius,
      depth,
      height,
      centerX,
      centerZ,
      seedOffset: seedOffset + 20,
    });
  } else {
    const roofHeight = Math.min(3.2, Math.max(1.4, radius * 1.25));
    sets.roof.push(coneRoof({
      radius: radius + depth * 0.85,
      height: roofHeight,
      y: height + 0.06,
      centerX,
      centerZ,
      sides: recipe.detail === 3 ? 28 : 20,
    }));
    sets.roof.push(cylinder({
      radius: radius + depth * 0.9,
      height: 0.12,
      position: [centerX, height + 0.05, centerZ],
      sides: recipe.detail === 3 ? 28 : 20,
    }));
    flagBase = height + roofHeight + 0.08;
  }
  sets.metal.push(cylinder({
    radius: 0.035,
    height: 1.45,
    position: [centerX, flagBase + 0.72, centerZ],
    sides: 8,
  }));
  sets.metal.push(flagGeometry({
    width: 0.9,
    height: 0.42,
    position: [centerX + 0.03, flagBase + 1.12, centerZ],
  }));
}

function towerOpenings(recipe, height, { includeDoor }) {
  const openings = [];
  if (includeDoor) {
    const width = Math.min(1.45, recipe.width * 0.26);
    openings.push({
      centerX: 0,
      angle: 0,
      bottom: 0,
      width,
      springHeight: Math.min(1.8, height * 0.3),
      radius: width / 2,
      door: true,
    });
  }
  if (recipe.windows && height >= 3.6) {
    openings.push({
      centerX: 0,
      angle: 0,
      bottom: height * 0.52,
      width: 0.55,
      springHeight: 0.72,
      radius: 0.275,
      door: false,
    });
  }
  return openings;
}

function addTowerOpeningDetails(sets, recipe, openings, {
  centerX,
  centerZ,
  radius,
  depth,
  seedOffset,
}) {
  const frontZ = centerZ + radius + depth * 0.55;
  openings.forEach((opening, index) => {
    addOpeningDetails(sets, recipe, {
      ...opening,
      centerX: centerX + opening.centerX,
    }, {
      frontZ,
      seedOffset: seedOffset + index,
      door: opening.door,
    });
  });
}

function buildIvy(sets, recipe, {
  width,
  height,
  frontZ,
  centerX = 0,
  seedOffset,
}) {
  if (!recipe.ivy) return;
  const random = createRandom(mixSeed(recipe.seed, seedOffset));
  const clusters = 18 + recipe.detail * 7;
  const side = random() < 0.5 ? -1 : 1;
  let previous = null;
  for (let index = 0; index < clusters; index += 1) {
    const rise = index / Math.max(1, clusters - 1);
    const x = centerX + side * width * (0.34 + random() * 0.12)
      + Math.sin(rise * 8 + seedOffset) * width * 0.05;
    const y = 0.2 + rise * height * (0.55 + random() * 0.25);
    if (previous && index % 2 === 0) {
      const deltaX = x - previous.x;
      const deltaY = y - previous.y;
      const length = Math.hypot(deltaX, deltaY);
      sets.foliage.push(beveledBox({
        width: 0.035,
        height: Math.max(0.08, length),
        depth: 0.035,
        position: [(x + previous.x) / 2, (y + previous.y) / 2, frontZ + 0.035],
        rotation: [0, 0, -Math.atan2(deltaX, deltaY)],
        detail: 1,
        bevelRatio: 0.08,
      }));
    }
    sets.foliage.push(leaf({
      radius: 0.1 + random() * 0.075,
      position: [x, y, frontZ + 0.025 + random() * 0.025],
      rotation: [random() * 0.8, random() * 0.4, random() * Math.PI],
    }));
    previous = { x, y };
  }
}

function createEmptySets() {
  return {
    stone: [],
    mortar: [],
    wood: [],
    roof: [],
    metal: [],
    foliage: [],
    recess: [],
  };
}

function buildWall(recipe) {
  const sets = createEmptySets();
  const openings = recipe.windows && recipe.height >= 3.4
    ? [-1, 1].map((side) => ({
      centerX: side * recipe.width * 0.23,
      bottom: recipe.height * 0.43,
      width: 0.44,
      springHeight: 0.64,
      radius: 0.22,
    }))
    : [];
  sets.stone.push(...buildWallCourses(recipe, { openings, seedOffset: 10 }));
  sets.mortar.push(beveledBox({
    width: recipe.width * 0.995,
    height: recipe.height * 0.995,
    depth: recipe.depth * 0.86,
    position: [0, recipe.height / 2, 0],
    detail: 1,
    bevelRatio: 0.012,
  }));
  openings.forEach((opening, index) => {
    addOpeningDetails(sets, recipe, opening, {
      frontZ: recipe.depth / 2 + 0.07,
      seedOffset: 30 + index,
    });
  });
  if (recipe.topStyle === 'battlements') {
    buildBattlementLine(sets, recipe, {
      width: recipe.width,
      depth: recipe.depth,
      y: recipe.height,
      seedOffset: 50,
    });
  } else {
    sets.roof.push(...wallRoofPlanes({
      width: recipe.width,
      depth: recipe.depth,
      y: recipe.height,
      height: Math.min(1.1, recipe.depth * 0.65),
      detail: recipe.detail,
    }));
  }
  buildIvy(sets, recipe, {
    width: recipe.width,
    height: recipe.height,
    frontZ: recipe.depth / 2,
    seedOffset: 60,
  });
  return sets;
}

function buildTower(recipe) {
  const sets = createEmptySets();
  const depth = Math.max(0.5, recipe.depth * 0.58);
  const radius = Math.max(1, recipe.width / 2 - depth * 0.22);
  const openings = towerOpenings(recipe, recipe.height, { includeDoor: recipe.windows });
  sets.stone.push(...buildTowerBody(recipe, {
    radius,
    depth,
    height: recipe.height,
    seedOffset: 100,
    openings,
  }));
  sets.mortar.push(cylinder({
    radius: Math.max(0.2, radius - depth * 0.46),
    height: recipe.height * 0.995,
    position: [0, recipe.height / 2, 0],
    sides: recipe.detail === 3 ? 64 : 48,
  }));
  addTowerOpeningDetails(sets, recipe, openings, {
    centerX: 0,
    centerZ: 0,
    radius,
    depth,
    seedOffset: 120,
  });
  addTowerTop(sets, recipe, {
    radius,
    depth,
    height: recipe.height,
    centerX: 0,
    centerZ: 0,
    seedOffset: 140,
  });
  buildIvy(sets, recipe, {
    width: radius * 1.6,
    height: recipe.height,
    frontZ: radius + depth * 0.56,
    seedOffset: 170,
  });
  return sets;
}

function addSquareTowerTop(sets, recipe, {
  width,
  depth,
  wallThickness,
  height,
}) {
  let flagBase = height + 0.7;
  if (recipe.topStyle === 'battlements') {
    const edges = [
      { edgeWidth: width, centerX: 0, centerZ: depth / 2, yaw: 0 },
      { edgeWidth: width, centerX: 0, centerZ: -depth / 2, yaw: 0 },
      { edgeWidth: depth, centerX: width / 2, centerZ: 0, yaw: Math.PI / 2 },
      { edgeWidth: depth, centerX: -width / 2, centerZ: 0, yaw: Math.PI / 2 },
    ];
    edges.forEach((edge, index) => {
      buildBattlementLine(sets, recipe, {
        width: edge.edgeWidth,
        depth: wallThickness + 0.12,
        y: height,
        centerX: edge.centerX,
        centerZ: edge.centerZ,
        yaw: edge.yaw,
        seedOffset: 580 + index * 10,
      });
    });
  } else {
    const roofHeight = Math.min(3.1, Math.max(1.5, width * 0.38));
    const roof = coneRoof({
      radius: width / Math.sqrt(2) + 0.36,
      height: roofHeight,
      y: height + 0.06,
      sides: 4,
      rotationY: Math.PI / 4,
    });
    roof.scale(1, 1, depth / width);
    sets.roof.push(roof);
    sets.roof.push(beveledBox({
      width: width + 0.52,
      height: 0.13,
      depth: depth + 0.52,
      position: [0, height + 0.04, 0],
      detail: 2,
      bevelRatio: 0.16,
    }));
    flagBase = height + roofHeight + 0.08;
  }
  sets.metal.push(cylinder({
    radius: 0.035,
    height: 1.45,
    position: [0, flagBase + 0.72, 0],
    sides: 8,
  }));
  sets.metal.push(flagGeometry({
    width: 0.9,
    height: 0.42,
    position: [0.03, flagBase + 1.12, 0],
  }));
}

function buildSquareTower(recipe) {
  const sets = createEmptySets();
  const width = recipe.width;
  const depth = Math.max(2.8, Math.min(recipe.width * 0.82, recipe.depth * 2.3));
  const wallThickness = Math.max(0.46, Math.min(0.82, recipe.depth * 0.34));
  const openings = recipe.windows
    ? [
      {
        centerX: 0,
        bottom: 0,
        width: Math.min(1.45, width * 0.27),
        springHeight: Math.min(1.85, recipe.height * 0.28),
        radius: Math.min(0.725, width * 0.135),
        door: true,
      },
      ...(recipe.height >= 4.4 ? [{
        centerX: 0,
        bottom: recipe.height * 0.54,
        width: 0.58,
        springHeight: 0.78,
        radius: 0.29,
        door: false,
      }] : []),
    ]
    : [];

  sets.stone.push(
    ...buildWallCourses(recipe, {
      width,
      depth: wallThickness,
      height: recipe.height,
      centerZ: depth / 2,
      openings,
      seedOffset: 500,
    }),
    ...buildWallCourses(recipe, {
      width,
      depth: wallThickness,
      height: recipe.height,
      centerZ: -depth / 2,
      seedOffset: 510,
    }),
    ...buildWallCourses(recipe, {
      width: depth,
      depth: wallThickness,
      height: recipe.height,
      centerX: width / 2,
      yaw: Math.PI / 2,
      seedOffset: 520,
    }),
    ...buildWallCourses(recipe, {
      width: depth,
      depth: wallThickness,
      height: recipe.height,
      centerX: -width / 2,
      yaw: Math.PI / 2,
      seedOffset: 530,
    }),
  );
  sets.mortar.push(beveledBox({
    width: width - wallThickness * 0.76,
    height: recipe.height * 0.995,
    depth: depth - wallThickness * 0.76,
    position: [0, recipe.height / 2, 0],
    detail: 1,
    bevelRatio: 0.01,
  }));
  openings.forEach((opening, index) => {
    addOpeningDetails(sets, recipe, opening, {
      frontZ: depth / 2 + wallThickness * 0.56,
      seedOffset: 550 + index,
      door: opening.door,
    });
  });
  addSquareTowerTop(sets, recipe, {
    width,
    depth,
    wallThickness,
    height: recipe.height,
  });
  buildIvy(sets, recipe, {
    width,
    height: recipe.height,
    frontZ: depth / 2 + wallThickness * 0.56,
    seedOffset: 640,
  });
  return sets;
}

function buildGatehouse(recipe) {
  const sets = createEmptySets();
  const gateWidth = Math.min(recipe.width * 0.32, 2.8);
  const gate = {
    centerX: 0,
    bottom: 0,
    width: gateWidth,
    springHeight: Math.min(2.15, recipe.height * 0.46),
    radius: gateWidth / 2,
  };
  sets.stone.push(...buildWallCourses(recipe, {
    openings: recipe.windows ? [gate] : [],
    seedOffset: 200,
  }));
  sets.mortar.push(beveledBox({
    width: recipe.width * 0.995,
    height: recipe.height * 0.995,
    depth: recipe.depth * 0.86,
    position: [0, recipe.height / 2, 0],
    detail: 1,
    bevelRatio: 0.012,
  }));
  if (recipe.windows) {
    addOpeningDetails(sets, recipe, gate, {
      frontZ: recipe.depth / 2 + 0.08,
      seedOffset: 220,
      door: true,
    });
  }
  buildBattlementLine(sets, recipe, {
    width: recipe.width,
    depth: recipe.depth,
    y: recipe.height,
    seedOffset: 240,
  });

  const towerDepth = Math.max(0.48, recipe.depth * 0.55);
  const towerRadius = Math.max(1.05, recipe.depth * 0.72);
  const towerHeight = recipe.height * 1.16;
  for (const [index, side] of [-1, 1].entries()) {
    const centerX = side * recipe.width * 0.39;
    const openings = towerOpenings(recipe, towerHeight, { includeDoor: false });
    sets.stone.push(...buildTowerBody(recipe, {
      radius: towerRadius,
      depth: towerDepth,
      height: towerHeight,
      centerX,
      seedOffset: 260 + index * 80,
      openings,
    }));
    sets.mortar.push(cylinder({
      radius: Math.max(0.2, towerRadius - towerDepth * 0.46),
      height: towerHeight * 0.995,
      position: [centerX, towerHeight / 2, 0],
      sides: recipe.detail === 3 ? 64 : 48,
    }));
    addTowerOpeningDetails(sets, recipe, openings, {
      centerX,
      centerZ: 0,
      radius: towerRadius,
      depth: towerDepth,
      seedOffset: 280 + index * 80,
    });
    addTowerTop(sets, recipe, {
      radius: towerRadius,
      depth: towerDepth,
      height: towerHeight,
      centerX,
      centerZ: 0,
      seedOffset: 300 + index * 80,
    });
  }
  buildIvy(sets, recipe, {
    width: recipe.width,
    height: recipe.height,
    frontZ: recipe.depth / 2,
    seedOffset: 450,
  });
  return sets;
}

function createGeometrySets(recipe) {
  if (recipe.archetype === 'wall') return buildWall(recipe);
  if (recipe.archetype === 'tower') return buildTower(recipe);
  if (recipe.archetype === 'square-tower') return buildSquareTower(recipe);
  return buildGatehouse(recipe);
}

function createPartsForSet(geometries, material, remesh) {
  if (geometries.length === 0) {
    material.dispose();
    return [];
  }
  if (!remesh) {
    return geometries.map((geometry) => ({
      geometry,
      material,
      matrix: new THREE.Matrix4(),
    }));
  }
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) {
    material.dispose();
    throw new Error('The workshop could not merge the generated geometry.');
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return [{ geometry: merged, material, matrix: new THREE.Matrix4() }];
}

function buildParts(recipe, sets) {
  const materials = createWorkshopMaterials(recipe);
  return [
    ...createPartsForSet(sets.stone, materials.stone, recipe.remesh),
    ...createPartsForSet(sets.mortar, materials.mortar, recipe.remesh),
    ...createPartsForSet(sets.wood, materials.wood, recipe.remesh),
    ...createPartsForSet(sets.roof, materials.roof, recipe.remesh),
    ...createPartsForSet(sets.metal, materials.metal, recipe.remesh),
    ...createPartsForSet(sets.foliage, materials.foliage, recipe.remesh),
    ...createPartsForSet(sets.recess, materials.recess, recipe.remesh),
  ];
}

function buildStats(recipe, sets) {
  const allGeometry = Object.values(sets).flat();
  const populatedSets = Object.values(sets).filter((geometries) => geometries.length > 0);
  return Object.freeze({
    stones: sets.stone.length,
    features: allGeometry.length - sets.stone.length,
    sourceVertices: allGeometry.reduce(
      (sum, geometry) => sum + geometry.getAttribute('position').count,
      0,
    ),
    drawParts: recipe.remesh ? populatedSets.length : allGeometry.length,
  });
}

export function createProceduralMedievalParts(input) {
  const recipe = normalizeProceduralRecipe(input);
  const sets = createGeometrySets(recipe);
  const stats = buildStats(recipe, sets);
  const parts = buildParts(recipe, sets);
  Object.defineProperty(parts, 'stats', { value: stats, enumerable: false });
  return Object.freeze(parts);
}

export function getProceduralRecipeStats(input) {
  const recipe = normalizeProceduralRecipe(input);
  const sets = createGeometrySets(recipe);
  const stats = buildStats(recipe, sets);
  Object.values(sets).flat().forEach((geometry) => geometry.dispose());
  return stats;
}
