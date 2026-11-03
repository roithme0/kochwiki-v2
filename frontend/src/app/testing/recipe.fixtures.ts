import type { RecipeVersionOut } from '../core/api/generated';
import type { RecipePresentation } from '../recipes/models/recipe-presentation';
import { nutritionSummary } from './nutrition.fixtures';

export function recipePresentation(
  overrides: Partial<RecipePresentation> = {},
): RecipePresentation {
  return structuredClone({
    ...nutritionSummary(),
    servings: 1,
    preptime: null,
    ingredients: [],
    steps: [],
    ...overrides,
  });
}

export function recipeVersionOut(
  overrides: Partial<RecipeVersionOut> = {},
): RecipeVersionOut {
  return structuredClone({
    ...nutritionSummary(),
    imageId: null,
    imageDimensions: null,
    ownerId: 1,
    recipeLineageId: '00000000-0000-4000-8000-000000000001',
    recipeVersionId: '00000000-0000-4000-8000-000000000002',
    state: 'active',
    createdAt: '2026-09-30T10:00:00Z',
    lastModified: '2026-09-30T10:00:00Z',
    name: 'Recipe',
    servings: 1,
    preptime: null,
    ingredients: [],
    steps: [],
    ...overrides,
  });
}
