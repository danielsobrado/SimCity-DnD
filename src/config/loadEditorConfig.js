import yaml from 'js-yaml';
import configSource from '../../editor.config.yaml?raw';
import { validateEditorConfig } from './validateEditorConfig.js';

export function loadEditorConfig() {
  const config = yaml.load(configSource);
  return Object.freeze(validateEditorConfig(config));
}
