import type { NutritionSummary } from '../core/models/nutrition-result';

export function nutritionSummary(
  overrides: Partial<NutritionSummary> = {},
): NutritionSummary {
  return structuredClone({
    kcal: { status: 'unknown', value: null },
    carbs: { status: 'unknown', value: null },
    protein: { status: 'unknown', value: null },
    fat: { status: 'unknown', value: null },
    fiber: { status: 'unknown', value: null },
    ...overrides,
  });
}
