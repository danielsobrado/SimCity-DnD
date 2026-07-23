import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  validateTreeImpostorManifest,
} from '../src/editor/stylized/impostor/TreeImpostorManifest.js';

const MANIFEST_PATH = resolve('public/assets/impostors/trees/manifest.json');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const REQUIRED = process.argv.includes('--required');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function publicPath(path) {
  return resolve('public', path.slice(1));
}

function pngSize(buffer, label) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${label} is not a valid PNG.`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function main() {
  if (!await exists(MANIFEST_PATH)) {
    if (REQUIRED) {
      throw new Error(`Required tree impostor manifest is missing: ${MANIFEST_PATH}`);
    }
    console.log('tree impostor manifest not present; runtime bake fallback remains enabled');
    return;
  }
  const manifest = validateTreeImpostorManifest(
    JSON.parse(await readFile(MANIFEST_PATH, 'utf8')),
  );
  for (const prototype of manifest.prototypes) {
    const expectedWidth = prototype.columns * prototype.tileSize;
    const expectedHeight = prototype.rows * prototype.tileSize;
    for (const field of ['albedo', 'normal']) {
      const path = publicPath(prototype[field]);
      const size = pngSize(await readFile(path), `${field} atlas ${path}`);
      if (size.width !== expectedWidth || size.height !== expectedHeight) {
        throw new Error(
          `${field} atlas ${path} is ${size.width}×${size.height}; expected ${expectedWidth}×${expectedHeight}.`,
        );
      }
    }
  }
  console.log(
    `validated ${manifest.prototypes.length} tree impostor prototypes (${manifest.sourceSignature})`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
