import type { FoodstuffSummaryOut } from '../../core/api/generated';

export type RecipePresentationFoodstuff = Pick<FoodstuffSummaryOut,
  'name' | 'unitVerbose' | 'kcal' | 'carbs' | 'protein' | 'fat'>;

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
  readonly kcal: number | null;
  readonly carbs: number | null;
  readonly protein: number | null;
  readonly fat: number | null;
  readonly ingredients: readonly RecipePresentationIngredient[];
  readonly steps: readonly RecipePresentationStep[];
}
