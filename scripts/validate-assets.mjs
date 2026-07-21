import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { resolvePublicAssetPath, validateGlbBuffer } from './lib/glb-validation.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..');
const OBJECT_CONFIG_PATH = path.join(REPOSITORY_ROOT, 'config', 'objects.yaml');
const MODEL_DIRECTORY = path.join(REPOSITORY_ROOT, 'public', 'assets', 'models');

async function listGlbFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.glb'))
    .map((entry) => path.join(directory, entry.name));
}

async function main() {
  const parsed = yaml.load(await readFile(OBJECT_CONFIG_PATH, 'utf8'));
  if (!Array.isArray(parsed?.objects) || parsed.objects.length === 0) {
    throw new Error('config/objects.yaml must contain object definitions.');
  }

  const referencedFiles = new Set();
  const validationByFile = new Map();
  for (const definition of parsed.objects) {
    if (typeof definition?.key !== 'string' || definition.key.trim() === '') {
      throw new Error('Every object definition must have a key.');
    }
    if (!definition.asset) {
      throw new Error(`Object ${definition.key} is missing its production GLB asset.`);
    }
    if (typeof definition.model !== 'string' || definition.model.trim() === '') {
      throw new Error(`Object ${definition.key} is missing its procedural fallback model.`);
    }

    const filePath = resolvePublicAssetPath(REPOSITORY_ROOT, definition.asset.path);
    const resolvedFile = path.resolve(filePath);
    let result = validationByFile.get(resolvedFile);
    if (!result) {
      result = validateGlbBuffer(await readFile(filePath), `Asset pack ${definition.asset.path}`);
      validationByFile.set(resolvedFile, result);
    }
    if (definition.asset.node && !result.nodeNames.includes(definition.asset.node)) {
      throw new Error(
        `Object ${definition.key} references missing GLB node ${definition.asset.node}.`,
      );
    }
    referencedFiles.add(resolvedFile);
    console.log(
      `validated ${definition.key}: ${path.relative(REPOSITORY_ROOT, filePath)}`
      + `${definition.asset.node ? `#${definition.asset.node}` : ''}`,
    );
  }

  const modelFiles = await listGlbFiles(MODEL_DIRECTORY);
  const unreferenced = modelFiles.filter((filePath) => !referencedFiles.has(path.resolve(filePath)));
  if (unreferenced.length > 0) {
    throw new Error(
      `Unreferenced GLB assets: ${unreferenced.map((filePath) => path.basename(filePath)).join(', ')}.`,
    );
  }

  console.log(
    `validated ${parsed.objects.length} object definitions across `
    + `${referencedFiles.size} GLB asset packs with procedural fallbacks`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
