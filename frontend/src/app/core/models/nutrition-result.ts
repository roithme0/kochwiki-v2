import { formatNumber } from '@angular/common';
import type {
  ExactNutrition,
  MinimumNutrition,
  UnknownNutrition,
} from '../api/generated';
import type { NutritionValues } from './nutrition-values';

export type NutritionResult =
  | ExactNutrition
  | MinimumNutrition
  | UnknownNutrition;

export interface NutritionSummary {
  kcal: NutritionResult;
  carbs: NutritionResult;
  protein: NutritionResult;
  fat: NutritionResult;
}

export function toNutritionSummary(
  nutrition: NutritionValues,
): NutritionSummary {
  const result = (value: number | null | undefined): NutritionResult =>
    value == null
      ? { status: 'unknown', value: null }
      : { status: 'exact', value };
  return {
    kcal: result(nutrition.kcal),
    carbs: result(nutrition.carbs),
    protein: result(nutrition.protein),
    fat: result(nutrition.fat),
  };
}

export function formatNutritionResult(
  result: NutritionResult,
  decimals: number,
  locale: string,
): string {
  if (result.status === 'unknown') return '—';
  const factor = 10 ** decimals;
  const scaled = result.value * factor;
  const value =
    result.status === 'minimum' && Number.isFinite(scaled)
      ? Math.floor(scaled) / factor
      : result.value;
  return `${result.status === 'minimum' ? '≥ ' : ''}${formatNumber(value, locale, `1.0-${decimals}`)}`;
}
