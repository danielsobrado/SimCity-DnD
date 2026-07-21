import yaml from 'js-yaml';
import objectCatalogYaml from '../../config/objects.yaml?raw';
import { TILE_BY_KEY } from './tileCatalog.js';
import { createObjectCatalog } from './objectCatalogSchema.js';

const parsed = yaml.load(objectCatalogYaml);

export const OBJECT_CATALOG = createObjectCatalog(parsed?.objects, TILE_BY_KEY);
export const OBJECT_BY_KEY = new Map(OBJECT_CATALOG.map((definition) => [definition.key, definition]));
