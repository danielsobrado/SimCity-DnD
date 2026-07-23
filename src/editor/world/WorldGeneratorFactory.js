import { AzgaarMacroWorldGenerator } from './AzgaarMacroWorldGenerator.js';
import { ProceduralWorldGenerator } from './ProceduralWorldGenerator.js';

export function createWorldGenerator(metadata, baseTerrain = null) {
  if (!baseTerrain) {
    return new ProceduralWorldGenerator(metadata);
  }
  if (baseTerrain.kind === 'azgaar-macro-v1') {
    return new AzgaarMacroWorldGenerator(baseTerrain, metadata);
  }
  throw new Error(`Unsupported base terrain source: ${baseTerrain.kind ?? 'unknown'}.`);
}

