import { RecipeIngredientWrite } from './ingredient';
import { RecipeStepWrite } from './step';

export interface RecipeVersionWrite {
  name: string;
  servings: number;
  preptime: number | null;
  originName: string | null;
  originUrl: string | null;
  ingredients: RecipeIngredientWrite[];
  steps: RecipeStepWrite[];
}
