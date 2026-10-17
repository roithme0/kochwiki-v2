import { Pipe, PipeTransform } from '@angular/core';
import {
  NutritionSummary,
  toNutritionSummary,
} from '../models/nutrition-result';
import { NutritionValues } from '../models/nutrition-values';

@Pipe({ name: 'nutritionSummary' })
export class NutritionSummaryPipe implements PipeTransform {
  transform(nutrition: NutritionValues): NutritionSummary {
    return toNutritionSummary(nutrition);
  }
}
