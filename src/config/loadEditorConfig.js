import yaml from 'js-yaml';
import configSource from '../../editor.config.yaml?raw';
import { validateEditorConfig } from './validateEditorConfig.js';
import { validateStylizedLodConfig } from './validateStylizedLodConfig.js';

export function loadEditorConfig() {
  const config = yaml.load(configSource);
  validateEditorConfig(config);
  validateStylizedLodConfig(config);
  return Object.freeze(config);
}
