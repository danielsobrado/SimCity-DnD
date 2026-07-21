import yaml from 'js-yaml';
import objectCatalogYaml from '../../config/objects.yaml?raw';
import { OBJECT_CATALOG } from './objectCatalog.js';
import { createObjectRenderCatalog } from './objectAssetSchema.js';

const parsed = yaml.load(objectCatalogYaml);

export const OBJECT_RENDER_CATALOG = createObjectRenderCatalog(parsed?.objects, OBJECT_CATALOG);
