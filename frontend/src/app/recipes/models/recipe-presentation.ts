import type { NutritionResult } from '../../core/models/nutrition-result';
import type { FoodstuffSummaryOut } from '../../core/api/generated';

export type RecipePresentationFoodstuff = Pick<
  FoodstuffSummaryOut,
  'name' | 'unitVerbose' | 'kcal' | 'carbs' | 'protein' | 'fat'
>;

export interface RecipePresentationIngredient {
  readonly index: number;
  readonly amount: number;
  readonly foodstuff: RecipePresentationFoodstuff;
}

export interface RecipePresentationStep {
  readonly index: number;
  readonly description: string;
}

export interface RecipePresentation {
  readonly servings: number;
  readonly preptime: number | null;
  readonly kcal: NutritionResult;
  readonly carbs: NutritionResult;
  readonly protein: NutritionResult;
  readonly fat: NutritionResult;
  readonly ingredients: readonly RecipePresentationIngredient[];
  readonly steps: readonly RecipePresentationStep[];
}
