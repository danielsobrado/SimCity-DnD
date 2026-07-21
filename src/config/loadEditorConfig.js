import yaml from 'js-yaml';
import configSource from '../../editor.config.yaml?raw';

const REQUIRED_POSITIVE_FIELDS = [
  ['map.width'],
  ['map.height'],
  ['map.tileSize'],
  ['map.chunkSize'],
  ['camera.viewSize'],
];

function readPath(value, path) {
  return path.reduce((current, segment) => current?.[segment], value);
}

function assertPositiveNumber(config, path) {
  const value = readPath(config, path);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid editor configuration: ${path.join('.')} must be positive.`);
  }
}

export function loadEditorConfig() {
  const config = yaml.load(configSource);
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid editor configuration: expected a YAML object.');
  }

  for (const path of REQUIRED_POSITIVE_FIELDS) {
    assertPositiveNumber(config, path);
  }

  if (!Array.isArray(config.brush?.sizes) || config.brush.sizes.length === 0) {
    throw new Error('Invalid editor configuration: brush.sizes must not be empty.');
  }

  return Object.freeze(config);
}
