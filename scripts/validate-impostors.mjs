import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const MANIFEST_PATH = resolve('public/assets/impostors/trees/manifest.json');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function publicPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/assets/')) {
    throw new Error(`Invalid public impostor asset path: ${path}`);
  }
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
    console.log('tree impostor manifest not present; runtime bake fallback remains enabled');
    return;
  }
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.prototypes) || manifest.prototypes.length === 0) {
    throw new Error('Tree impostor manifest is invalid.');
  }
  for (const prototype of manifest.prototypes) {
    for (const field of ['width', 'height', 'depth', 'centerY', 'radius']) {
      if (!Number.isFinite(prototype[field])) {
        throw new Error(`Tree impostor prototype ${prototype.prototypeIndex} has invalid ${field}.`);
      }
    }
    const gutter = prototype.gutter ?? 0;
    if (!Number.isInteger(gutter) || gutter < 0 || gutter * 2 >= prototype.tileSize) {
      throw new Error(`Tree impostor prototype ${prototype.prototypeIndex} has invalid gutter.`);
    }
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
  console.log(`validated ${manifest.prototypes.length} tree impostor prototypes`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
