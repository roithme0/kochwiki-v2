import { FoodstuffSummary } from '../../foodstuffs/models/foodstuff-summary';

export interface RecipePresentationIngredient {
  readonly index: number;
  readonly amount: number;
  readonly foodstuff: FoodstuffSummary;
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
