import {
  clamp,
  dot,
  floor,
  fract,
  mix,
  pow,
  smoothstep,
  vec2,
} from 'three/tsl';

function hash2(position) {
  const value = fract(position.mul(vec2(127.1, 311.7)));
  const mixed = value.add(dot(value, value.add(19.19)));
  return fract(mixed.x.mul(mixed.y));
}

function noise2(position) {
  const integer = floor(position);
  const fraction = fract(position);
  const curve = fraction.mul(fraction).mul(vec2(3).sub(fraction.mul(2)));
  const north = mix(
    hash2(integer),
    hash2(integer.add(vec2(1, 0))),
    curve.x,
  );
  const south = mix(
    hash2(integer.add(vec2(0, 1))),
    hash2(integer.add(vec2(1, 1))),
    curve.x,
  );
  return mix(north, south, curve.y);
}

export function stylizedFbm(position) {
  const octave0 = noise2(position).mul(0.5);
  const octave1 = noise2(position.mul(2.03).add(vec2(3.1, 7.7))).mul(0.25);
  const octave2 = noise2(position.mul(4.1209).add(vec2(9.393, 23.331))).mul(0.125);
  const octave3 = noise2(position.mul(8.365427).add(vec2(22.168, 55.062))).mul(0.0625);
  return octave0.add(octave1).add(octave2).add(octave3).div(0.9375);
}

export function stylizedDirtMask(worldXZ, settings) {
  const position = worldXZ.mul(settings.scale);
  const warp = vec2(
    stylizedFbm(position.add(vec2(11.3, 2.7))),
    stylizedFbm(position.add(vec2(5.9, 17.1))),
  ).sub(0.5).mul(settings.warp);
  const value = stylizedFbm(position.add(warp));
  const threshold = settings.coverage.oneMinus();
  return smoothstep(
    threshold.sub(settings.softness),
    threshold.add(settings.softness),
    value,
  );
}

export function stylizedPatchMask(worldXZ, settings) {
  return pow(
    clamp(stylizedFbm(worldXZ.mul(settings.scale)), 0, 1),
    settings.bias,
  );
}
