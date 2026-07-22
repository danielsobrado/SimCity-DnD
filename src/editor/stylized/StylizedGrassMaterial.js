import * as THREE from 'three/webgpu';
import {
  attribute,
  clamp,
  cos,
  dot,
  float,
  max,
  mix,
  oneMinus,
  positionLocal,
  pow,
  sin,
  texture,
  vec2,
  vec3,
} from 'three/tsl';
import { stylizedDirtMask, stylizedPatchMask } from './StylizedNoiseNodes.js';

function colorNode(value) {
  const color = new THREE.Color(value);
  return vec3(color.r, color.g, color.b);
}

export function createStylizedGrassMaterial({
  surfaceMaskTexture,
  chunkCenter,
  chunkWorldSize,
  time,
  config,
}) {
  const base = attribute('instanceBase', 'vec3');
  const parameters = attribute('instanceParams', 'vec4');
  const trample = attribute('instanceTrample', 'vec3');
  const normalizedHeight = positionLocal.y;
  const localUv = vec2(
    base.x.div(chunkWorldSize).add(0.5),
    float(0.5).sub(base.z.div(chunkWorldSize)),
  );
  const worldXZ = base.xz.add(chunkCenter);
  const surface = texture(surfaceMaskTexture, localUv);

  const dirtSettings = {
    scale: float(config.dirt.scale),
    coverage: float(config.dirt.coverage),
    softness: float(config.dirt.softness),
    warp: float(config.dirt.warp),
  };
  const patchSettings = {
    scale: float(config.patch.scale),
    bias: float(config.patch.bias),
  };
  const dirt = max(surface.r, stylizedDirtMask(worldXZ, dirtSettings));
  const shrink = oneMinus(dirt.mul(config.dirt.bladeCut))
    .mul(oneMinus(trample.z.mul(config.rocks.flatten)));
  const bladeHeight = normalizedHeight.mul(parameters.y).mul(shrink);
  const heightMask = normalizedHeight.mul(shrink).pow(2);

  const angle = parameters.z;
  const bladeAxis = vec2(cos(angle), sin(angle));
  const widthOffset = bladeAxis.mul(positionLocal.x.mul(parameters.x));
  const windDirection = vec2(config.wind.direction[0], config.wind.direction[1]);
  const windPerpendicular = vec2(windDirection.y.negate(), windDirection.x);
  const primary = sin(dot(worldXZ, windDirection).mul(config.wind.frequency)
    .add(time.mul(config.wind.speed)));
  const secondary = sin(dot(worldXZ, windDirection).mul(config.wind.frequency * 2.6)
    .add(time.mul(config.wind.speed * 1.8))
    .add(1.3)).mul(0.35);
  const turbulence = sin(dot(worldXZ, windPerpendicular).mul(config.wind.frequency * 1.9)
    .add(time.mul(config.wind.speed * 0.7))
    .add(2.6)).mul(config.wind.turbulence);
  const swing = primary.add(secondary).add(turbulence)
    .mul(config.wind.strength)
    .mul(heightMask);
  const lean = float(config.wind.lean).mul(heightMask);
  const windOffset = windDirection.mul(swing.add(lean));
  const rockOffset = trample.xy.mul(config.rocks.bend).mul(trample.z).mul(heightMask);

  const finalXZ = base.xz.add(widthOffset).add(windOffset).add(rockOffset);
  const finalPosition = vec3(finalXZ.x, base.y.add(bladeHeight), finalXZ.y);

  const gradient = pow(clamp(
    normalizedHeight.sub(config.color.gradientStart)
      .div(Math.max(0.001, config.color.gradientEnd - config.color.gradientStart)),
    0,
    1,
  ), config.color.gradientPower);
  const patch = stylizedPatchMask(worldXZ, patchSettings);
  const baseColor = mix(
    colorNode(config.color.bottom),
    colorNode(config.color.top),
    gradient,
  );
  const patchColor = mix(
    colorNode(config.patch.lush),
    colorNode(config.patch.dry),
    patch,
  );
  const variedColor = mix(baseColor, patchColor, config.patch.strength);
  const dirtColor = colorNode(config.dirt.color);
  const bladeColor = mix(variedColor, dirtColor, dirt.mul(config.dirt.bladeBlend))
    .mul(config.color.brightness);

  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.positionNode = finalPosition;
  material.colorNode = bladeColor;
  material.depthWrite = true;
  material.transparent = false;
  return material;
}
