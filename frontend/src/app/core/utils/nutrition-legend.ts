import { ChartLegendElement } from '../models/chart-legend-element';
import { NutritionValues } from '../models/nutrition-values';

const MACROS = [
  { key: 'carbs', displayName: 'Kohlenhydrate', color: 'rgb(19,154,155)' },
  { key: 'protein', displayName: 'Protein', color: 'rgb(155, 255, 117)' },
  { key: 'fat', displayName: 'Fett', color: 'rgb(255,97,97)' },
] as const;

export function hasMacroDistribution(nutrition: NutritionValues): boolean {
  const { carbs, protein, fat } = nutrition;
  return carbs != null && protein != null && fat != null &&
    carbs + protein + fat > 0;
}

export function buildNutritionLegend(nutrition: NutritionValues): Record<string, ChartLegendElement> {
  const total = hasMacroDistribution(nutrition)
    ? (nutrition.carbs ?? 0) + (nutrition.protein ?? 0) + (nutrition.fat ?? 0)
    : null;
  return Object.fromEntries(MACROS.map(({ key, displayName, color }) => {
    const value = nutrition[key] ?? null;
    return [key, {
      displayName,
      color,
      valueAbsolute: value,
      valuePercentage: total === null || value === null ? null : value / total * 100,
    }];
  }));
}
