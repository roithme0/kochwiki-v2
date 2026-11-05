import type { FoodstuffOut, FoodstuffSummaryOut } from '../core/api/generated';

export function foodstuffSummary(
  overrides: Partial<FoodstuffSummaryOut> = {},
): FoodstuffSummaryOut {
  return {
    id: 1,
    name: 'Foodstuff',
    brand: null,
    details: null,
    unit: 'G',
    unitVerbose: 'g',
    imageId: null,
    kcal: null,
    carbs: null,
    protein: null,
    fat: null,
    fiber: null,
    ...overrides,
  };
}

export function foodstuffOut(
  overrides: Partial<FoodstuffOut> = {},
): FoodstuffOut {
  return structuredClone({
    ...foodstuffSummary(),
    recipeVersionIds: [],
    ...overrides,
  });
}
