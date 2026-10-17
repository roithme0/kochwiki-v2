import type { NutritionResult } from './nutrition-result';

export interface ChartLegendElement {
  displayName: string;
  color: string;
  value: NutritionResult;
  valuePercentage: number | null;
}
