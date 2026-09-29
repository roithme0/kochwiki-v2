import type { FoodstuffOut } from '../../core/api/generated';
import { FoodstuffUnit } from '../../foodstuffs/models/foodstuff-unit';

export interface DraftIngredientNutrition {
  foodstuffId: number | null;
  amount: number | null;
}

export interface RecipeNutrition {
  kcal: number | null;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
}

export type DraftNutritionState =
  | { status: 'empty' | 'invalid' }
  | { status: 'incomplete'; nutrition: RecipeNutrition }
  | { status: 'complete'; nutrition: RecipeNutrition };

type NutritionField = keyof RecipeNutrition;

const NUTRITION_FIELDS: NutritionField[] = [
  'kcal',
  'carbs',
  'protein',
  'fat',
];

export function calculateDraftNutrition(
  ingredients: DraftIngredientNutrition[],
  servings: number | null,
  foodstuffs: FoodstuffOut[]
): DraftNutritionState {
  const selectedIngredients = ingredients.filter(hasFoodstuffId);
  if (selectedIngredients.length === 0) return { status: 'empty' };
  if (!isValidServings(servings)) return { status: 'invalid' };

  const totals: RecipeNutrition = { kcal: 0, carbs: 0, protein: 0, fat: 0 };

  for (const ingredient of selectedIngredients) {
    if (!isValidIngredient(ingredient)) return { status: 'invalid' };

    const foodstuff = foodstuffs.find(
      ({ id }) => id === ingredient.foodstuffId
    );
    if (foodstuff === undefined) return { status: 'invalid' };

    const multiplier =
      foodstuff.unit === FoodstuffUnit.Gram ||
      foodstuff.unit === FoodstuffUnit.Milliliter
        ? ingredient.amount / 100
        : ingredient.amount;

    for (const field of NUTRITION_FIELDS) {
      const value = foodstuff[field];
      totals[field] =
        totals[field] === null || !isFiniteNutritionValue(value)
          ? null
          : totals[field] + value * multiplier;
    }
  }

  const nutrition: RecipeNutrition = {
    kcal: totals.kcal === null ? null : totals.kcal / servings,
    carbs: totals.carbs === null ? null : totals.carbs / servings,
    protein: totals.protein === null ? null : totals.protein / servings,
    fat: totals.fat === null ? null : totals.fat / servings,
  };

  return nutrition.carbs === null ||
    nutrition.protein === null ||
    nutrition.fat === null
    ? { status: 'incomplete', nutrition }
    : { status: 'complete', nutrition };
}

function hasFoodstuffId(
  ingredient: DraftIngredientNutrition
): ingredient is DraftIngredientNutrition & { foodstuffId: number } {
  return ingredient.foodstuffId !== null;
}

function isValidServings(servings: number | null): servings is number {
  return (
    servings !== null &&
    Number.isInteger(servings) &&
    servings >= 1 &&
    servings <= 99
  );
}

function isValidIngredient(
  ingredient: DraftIngredientNutrition
): ingredient is { foodstuffId: number; amount: number } {
  return (
    ingredient.foodstuffId !== null &&
    Number.isInteger(ingredient.foodstuffId) &&
    ingredient.foodstuffId > 0 &&
    ingredient.amount !== null &&
    Number.isFinite(ingredient.amount) &&
    ingredient.amount > 0 &&
    ingredient.amount <= 9999
  );
}

function isFiniteNutritionValue(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}
