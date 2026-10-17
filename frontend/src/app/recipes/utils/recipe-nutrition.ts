import type { FoodstuffSummaryOut } from '../../core/api/generated';
import type {
  NutritionResult,
  NutritionSummary,
} from '../../core/models/nutrition-result';

export interface DraftIngredientNutrition {
  foodstuffId: number | null;
  amount: number | null;
}

export type DraftNutritionState =
  { status: 'invalid' } | { status: 'ready'; nutrition: NutritionSummary };

type NutritionField = keyof NutritionSummary;

export function calculateDraftNutrition(
  ingredients: DraftIngredientNutrition[],
  servings: number | null,
  foodstuffs: FoodstuffSummaryOut[],
): DraftNutritionState {
  if (!isValidServings(servings)) return { status: 'invalid' };
  const selectedIngredients = ingredients.filter(hasFoodstuffId);

  const calculate = (field: NutritionField): NutritionResult => {
    let total = 0;
    let known = 0;
    for (const ingredient of selectedIngredients) {
      if (!isValidIngredient(ingredient)) continue;
      const foodstuff = foodstuffs.find(
        ({ id }) => id === ingredient.foodstuffId,
      );
      if (foodstuff === undefined) continue;
      const value = foodstuff[field];
      if (!isFiniteNutritionValue(value)) continue;

      const multiplier =
        foodstuff.unit === 'G' || foodstuff.unit === 'ML'
          ? ingredient.amount / 100
          : ingredient.amount;
      total += value * multiplier;
      known += 1;
    }
    if (known === 0) return { status: 'unknown', value: null };
    return {
      status: known === selectedIngredients.length ? 'exact' : 'minimum',
      value: total / servings,
    };
  };

  return {
    status: 'ready',
    nutrition: {
      kcal: calculate('kcal'),
      carbs: calculate('carbs'),
      protein: calculate('protein'),
      fat: calculate('fat'),
    },
  };
}

function hasFoodstuffId(
  ingredient: DraftIngredientNutrition,
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
  ingredient: DraftIngredientNutrition,
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
