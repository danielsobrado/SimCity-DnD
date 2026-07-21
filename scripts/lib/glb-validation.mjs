import path from 'node:path';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

export function validateGlbBuffer(buffer, label = 'GLB asset') {
  if (!Buffer.isBuffer(buffer) || buffer.length < HEADER_BYTES + CHUNK_HEADER_BYTES) {
    throw new Error(`${label} is too small to be a GLB file.`);
  }
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`${label} has an invalid GLB magic header.`);
  }
  if (buffer.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error(`${label} must use glTF binary version 2.`);
  }
  if (buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error(`${label} has an invalid declared length.`);
  }

  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  const jsonEnd = HEADER_BYTES + CHUNK_HEADER_BYTES + jsonLength;
  if (jsonType !== JSON_CHUNK_TYPE || jsonEnd > buffer.length) {
    throw new Error(`${label} does not contain a valid JSON chunk.`);
  }

  const jsonText = buffer
    .subarray(HEADER_BYTES + CHUNK_HEADER_BYTES, jsonEnd)
    .toString('utf8')
    .replace(/[\u0000\s]+$/u, '');
  let document;
  try {
    document = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`${label} contains invalid glTF JSON: ${error.message}`);
  }

  if (typeof document.asset?.version !== 'string' || !document.asset.version.startsWith('2')) {
    throw new Error(`${label} does not declare glTF 2.x.`);
  }
  if (!Array.isArray(document.meshes) || document.meshes.length === 0) {
    throw new Error(`${label} contains no meshes.`);
  }
  if (!Array.isArray(document.nodes) || document.nodes.length === 0) {
    throw new Error(`${label} contains no nodes.`);
  }
  if (!Array.isArray(document.scenes) || document.scenes.length === 0) {
    throw new Error(`${label} contains no scenes.`);
  }

  return Object.freeze({
    meshCount: document.meshes.length,
    nodeCount: document.nodes.length,
    sceneCount: document.scenes.length,
    nodeNames: Object.freeze(document.nodes.map((node) => node.name).filter(Boolean)),
  });
}

export function resolvePublicAssetPath(repositoryRoot, assetPath) {
  if (typeof assetPath !== 'string' || assetPath.trim() === '') {
    throw new Error('Asset path must be a non-empty string.');
  }
  const publicRoot = path.resolve(repositoryRoot, 'public');
  const resolved = path.resolve(publicRoot, assetPath.replace(/^\/+/, ''));
  if (resolved !== publicRoot && !resolved.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error(`Asset path escapes the public directory: ${assetPath}.`);
  }
  return resolved;
}
