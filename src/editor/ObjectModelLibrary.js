import * as THREE from 'three';

function material(color, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
}

function part(geometry, color, position, rotation = [0, 0, 0]) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
  matrix.compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(1, 1, 1));
  return { geometry, material: material(color), matrix };
}

function box(width, height, depth, color, position, rotation) {
  return part(new THREE.BoxGeometry(width, height, depth), color, position, rotation);
}

function cone(radius, height, sides, color, position, rotation) {
  return part(new THREE.ConeGeometry(radius, height, sides), color, position, rotation);
}

function cylinder(radius, height, sides, color, position, rotation) {
  return part(new THREE.CylinderGeometry(radius, radius, height, sides), color, position, rotation);
}

function cottage(tileSize) {
  return [
    box(tileSize * 1.55, tileSize * 0.82, tileSize * 1.45, '#c79a6b', [0, tileSize * 0.41, 0]),
    cone(tileSize * 1.22, tileSize * 0.78, 4, '#7b3428', [0, tileSize * 1.18, 0], [0, Math.PI / 4, 0]),
    box(tileSize * 0.22, tileSize * 0.48, tileSize * 0.12, '#56311f', [0, tileSize * 0.25, tileSize * 0.77]),
  ];
}

function farmstead(tileSize) {
  return [
    box(tileSize * 2.65, tileSize * 0.08, tileSize * 2.65, '#9d7a2a', [0, tileSize * 0.04, 0]),
    box(tileSize * 1.15, tileSize * 0.72, tileSize * 1.1, '#a54a32', [-tileSize * 0.55, tileSize * 0.4, -tileSize * 0.55]),
    cone(tileSize * 0.9, tileSize * 0.62, 4, '#5b4333', [-tileSize * 0.55, tileSize * 1.02, -tileSize * 0.55], [0, Math.PI / 4, 0]),
    box(tileSize * 1.0, tileSize * 0.08, tileSize * 0.22, '#d8bd4f', [tileSize * 0.55, tileSize * 0.12, tileSize * 0.35]),
    box(tileSize * 1.0, tileSize * 0.08, tileSize * 0.22, '#d8bd4f', [tileSize * 0.55, tileSize * 0.12, tileSize * 0.75]),
  ];
}

function inn(tileSize) {
  return [
    box(tileSize * 2.45, tileSize * 0.95, tileSize * 1.5, '#b98452', [0, tileSize * 0.48, 0]),
    cone(tileSize * 1.72, tileSize * 0.92, 4, '#61352d', [0, tileSize * 1.34, 0], [0, Math.PI / 4, 0]),
    box(tileSize * 0.18, tileSize * 0.48, tileSize * 0.12, '#4c2b20', [0, tileSize * 0.26, tileSize * 0.8]),
    box(tileSize * 0.12, tileSize * 0.52, tileSize * 0.12, '#3a2d23', [tileSize * 1.12, tileSize * 0.9, tileSize * 0.62]),
  ];
}

function tower(tileSize) {
  return [
    cylinder(tileSize * 0.68, tileSize * 2.15, 12, '#8a8d93', [0, tileSize * 1.08, 0]),
    cone(tileSize * 0.92, tileSize * 1.12, 8, '#5f3b91', [0, tileSize * 2.72, 0]),
    box(tileSize * 0.22, tileSize * 0.48, tileSize * 0.12, '#4d3428', [0, tileSize * 0.26, tileSize * 0.7]),
  ];
}

function keep(tileSize) {
  const towerOffset = tileSize * 1.35;
  const parts = [
    box(tileSize * 2.7, tileSize * 1.45, tileSize * 2.7, '#85898d', [0, tileSize * 0.73, 0]),
    box(tileSize * 0.35, tileSize * 0.72, tileSize * 0.15, '#4c4034', [0, tileSize * 0.38, tileSize * 1.43]),
  ];
  for (const [x, z] of [[-towerOffset, -towerOffset], [towerOffset, -towerOffset], [-towerOffset, towerOffset], [towerOffset, towerOffset]]) {
    parts.push(cylinder(tileSize * 0.52, tileSize * 1.75, 10, '#777c80', [x, tileSize * 0.88, z]));
    parts.push(cone(tileSize * 0.65, tileSize * 0.55, 8, '#4e5964', [x, tileSize * 2.02, z]));
  }
  return parts;
}

function wall(tileSize) {
  return [
    box(tileSize * 0.88, tileSize * 0.72, tileSize * 0.3, '#777c80', [0, tileSize * 0.36, 0]),
    box(tileSize * 0.18, tileSize * 0.18, tileSize * 0.38, '#8a8f92', [-tileSize * 0.33, tileSize * 0.81, 0]),
    box(tileSize * 0.18, tileSize * 0.18, tileSize * 0.38, '#8a8f92', [tileSize * 0.33, tileSize * 0.81, 0]),
  ];
}

function tree(tileSize) {
  return [
    cylinder(tileSize * 0.12, tileSize * 0.72, 8, '#65452d', [0, tileSize * 0.36, 0]),
    cone(tileSize * 0.56, tileSize * 1.15, 9, '#2f6b3d', [0, tileSize * 1.15, 0]),
    cone(tileSize * 0.42, tileSize * 0.92, 9, '#3d7d48', [0, tileSize * 1.7, 0]),
  ];
}

function rock(tileSize) {
  return [part(
    new THREE.DodecahedronGeometry(tileSize * 0.38, 0),
    '#777d7d',
    [0, tileSize * 0.3, 0],
    [0.15, 0.4, -0.1],
  )];
}

const FACTORIES = Object.freeze({ cottage, farmstead, inn, tower, keep, wall, tree, rock });

export function createObjectModelParts(definition, tileSize) {
  const factory = FACTORIES[definition.model];
  if (!factory) {
    throw new Error(`Unknown procedural object model: ${definition.model}.`);
  }
  return factory(tileSize);
}
