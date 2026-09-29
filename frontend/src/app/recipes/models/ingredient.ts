import type { FoodstuffSummaryOut } from '../../core/api/generated';

export interface Ingredient {
  id: number;
  index: number;
  amount: number;
  foodstuff: FoodstuffSummaryOut;
  recipeVersionId: string;
}

export interface RecipeIngredientWrite {
  index: number;
  amount: number;
  foodstuffId: number;
}
