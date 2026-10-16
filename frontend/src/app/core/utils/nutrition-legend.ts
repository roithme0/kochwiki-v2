import { ChartLegendElement } from '../models/chart-legend-element';
import { NutritionSummary } from '../models/nutrition-result';

const MACROS = [
  { key: 'carbs', displayName: 'Kohlenhydrate', color: 'rgb(19,154,155)' },
  { key: 'protein', displayName: 'Protein', color: 'rgb(155, 255, 117)' },
  { key: 'fat', displayName: 'Fett', color: 'rgb(255,97,97)' },
] as const;

export function hasMacroDistribution(nutrition: NutritionSummary): boolean {
  const { carbs, protein, fat } = nutrition;
  return (
    carbs.status === 'exact' &&
    protein.status === 'exact' &&
    fat.status === 'exact' &&
    carbs.value + protein.value + fat.value > 0
  );
}

export function buildNutritionLegend(
  nutrition: NutritionSummary,
): Record<string, ChartLegendElement> {
  const total = hasMacroDistribution(nutrition)
    ? (nutrition.carbs.value ?? 0) +
      (nutrition.protein.value ?? 0) +
      (nutrition.fat.value ?? 0)
    : null;
  return Object.fromEntries(
    MACROS.map(({ key, displayName, color }) => {
      const result = nutrition[key];
      const value = result.value;
      return [
        key,
        {
          displayName,
          color,
          value: result,
          valuePercentage:
            total === null || value === null ? null : (value / total) * 100,
        },
      ];
    }),
  );
}
