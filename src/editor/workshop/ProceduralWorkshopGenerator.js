import { normalizeProceduralRecipe } from './ProceduralAssetStore.js';
import {
  createProceduralCastleWallParts,
  getProceduralCastleWallStats,
} from './ProceduralCastleWallGenerator.js';
import {
  createProceduralMedievalParts,
  getProceduralRecipeStats,
} from './ProceduralMedievalGenerator.js';

function usesCastleWallGenerator(recipe) {
  return recipe.archetype === 'wall' && recipe.shape !== 'classic';
}

export function createProceduralWorkshopParts(input) {
  const recipe = normalizeProceduralRecipe(input);
  return usesCastleWallGenerator(recipe)
    ? createProceduralCastleWallParts(recipe)
    : createProceduralMedievalParts(recipe);
}

export function getProceduralWorkshopStats(input) {
  const recipe = normalizeProceduralRecipe(input);
  return usesCastleWallGenerator(recipe)
    ? getProceduralCastleWallStats(recipe)
    : getProceduralRecipeStats(recipe);
}
