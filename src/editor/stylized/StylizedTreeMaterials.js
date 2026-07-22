import * as THREE from 'three/webgpu';
import {
  clamp,
  cos,
  dot,
  float,
  max,
  mix,
  positionLocal,
  pow,
  sin,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { stylizedFbm } from './StylizedNoiseNodes.js';

function colorNode(value) {
  const color = new THREE.Color(value);
  return vec3(color.r, color.g, color.b);
}

export function createStylizedLeafMaterial({ source, bounds, time, config }) {
  const normalizedHeight = clamp(
    positionLocal.y.sub(bounds.minY).div(Math.max(0.001, bounds.maxY - bounds.minY)),
    0,
    1,
  );
  const heightMask = normalizedHeight.mul(normalizedHeight);
  const localXZ = positionLocal.xz;
  const windDirection = vec2(config.wind.direction[0], config.wind.direction[1]);
  const windPerpendicular = vec2(windDirection.y.negate(), windDirection.x);
  const primary = sin(dot(localXZ, windDirection).mul(config.wind.frequency)
    .add(time.mul(config.wind.speed)));
  const flutter = sin(time.mul(config.wind.speed * config.trees.flutterSpeed)
    .add(positionLocal.y.mul(2.3))
    .add(positionLocal.x))
    .mul(config.trees.flutterAmplitude);
  const turbulence = sin(dot(localXZ, windPerpendicular).mul(config.wind.frequency * 1.9)
    .add(time.mul(config.wind.speed * 0.7)))
    .mul(config.wind.turbulence * 0.25);
  const wave = primary.add(flutter).add(turbulence);
  const sway = windDirection.mul(wave.mul(config.trees.windStrength).mul(heightMask));
  const dip = wave.abs().mul(config.trees.windStrength).mul(config.trees.dip).mul(heightMask);
  const finalPosition = positionLocal.add(vec3(sway.x, dip.negate(), sway.y));

  const gradient = pow(normalizedHeight, config.trees.gradientPower);
  const baseColor = mix(
    colorNode(config.trees.leafBottom),
    colorNode(config.trees.leafTop),
    gradient,
  );
  const variation = stylizedFbm(
    positionLocal.xz.add(positionLocal.y).mul(config.trees.variationScale),
  ).sub(0.5);
  const leafColor = max(
    baseColor.add(
      colorNode(config.trees.variationColor)
        .sub(baseColor)
        .mul(variation)
        .mul(config.trees.variationStrength),
    ),
    vec3(0),
  ).mul(config.trees.brightness);

  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.positionNode = finalPosition;
  material.colorNode = leafColor;
  if (source.map) {
    material.opacityNode = texture(source.map, uv()).a;
    material.alphaTest = source.alphaTest > 0 ? source.alphaTest : 0.6;
  }
  material.transparent = false;
  return material;
}

export function createStylizedTrunkMaterial({ textures, config }) {
  const bark = texture(textures.color, uv().mul(config.trees.barkScale)).rgb;
  const ao = texture(textures.ao, uv().mul(config.trees.barkScale)).r;
  const relief = texture(textures.height, uv().mul(config.trees.barkScale)).r;
  const tint = colorNode(config.trees.barkTint);
  const barkColor = mix(bark, tint, config.trees.barkTintStrength)
    .mul(mix(1, ao, config.trees.barkAoStrength))
    .mul(mix(0.82, 1.18, relief.mul(config.trees.barkRelief)))
    .mul(config.trees.barkBrightness);
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = barkColor;
  return material;
}
