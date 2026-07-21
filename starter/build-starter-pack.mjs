import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PART_COUNT = 4;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const buildDirectory = resolve(scriptDirectory, '.build');
const archivePath = resolve(buildDirectory, 'starter.tar.gz');
const outputPath = resolve(scriptDirectory, 'simcity-dnd-starter-pack.zip');

const archive = Array.from({ length: PART_COUNT }, (_, index) => {
  const partName = `archive.part${String(index + 1).padStart(2, '0')}`;
  return readFileSync(resolve(scriptDirectory, partName), 'utf8').trim();
}).join('');

rmSync(buildDirectory, { recursive: true, force: true });
rmSync(outputPath, { force: true });
mkdirSync(buildDirectory, { recursive: true });
writeFileSync(archivePath, Buffer.from(archive, 'base64'));

execFileSync('tar', ['-xzf', archivePath, '-C', buildDirectory], { stdio: 'inherit' });
execFileSync('zip', ['-9', '-r', outputPath, 'SimCity-DnD-starter'], {
  cwd: buildDirectory,
  stdio: 'inherit',
});

console.log(outputPath);
