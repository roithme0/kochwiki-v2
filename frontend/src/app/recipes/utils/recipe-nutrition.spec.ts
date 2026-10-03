import {
  DraftIngredientNutrition,
  calculateDraftNutrition,
} from './recipe-nutrition';
import type { FoodstuffOut } from '../../core/api/generated';
import { FoodstuffUnit } from '../../foodstuffs/models/foodstuff-unit';

describe('calculateDraftNutrition', () => {
  const foodstuffs: FoodstuffOut[] = [
    {
      id: 1,
      name: 'Haferflocken',
      brand: null,
      unit: FoodstuffUnit.Gram,
      unitVerbose: 'g',
      kcal: 370,
      carbs: 60,
      protein: 13,
      fat: 7,
      recipeVersionIds: [],
    },
    {
      id: 2,
      name: 'Ei',
      brand: null,
      unit: FoodstuffUnit.Piece,
      unitVerbose: 'Stk.',
      kcal: 80,
      carbs: 1,
      protein: 7,
      fat: 5,
      recipeVersionIds: [],
    },
    {
      id: 3,
      name: 'Milch',
      brand: null,
      unit: FoodstuffUnit.Milliliter,
      unitVerbose: 'ml',
      kcal: 50,
      carbs: 5,
      protein: 3,
      fat: 2,
      recipeVersionIds: [],
    },
  ];

  it('calculates per-serving values using per-100 and per-piece units', () => {
    const ingredients: DraftIngredientNutrition[] = [
      { foodstuffId: 1, amount: 200 },
      { foodstuffId: 2, amount: 2 },
      { foodstuffId: 3, amount: 200 },
    ];

    expect(calculateDraftNutrition(ingredients, 2, foodstuffs)).toEqual({
      status: 'complete',
      nutrition: { kcal: 500, carbs: 66, protein: 23, fat: 14 },
    });
  });

  it('keeps missing nutrition unknown and uses the recipe-page incomplete state', () => {
    const incompleteFoodstuff: FoodstuffOut = { ...foodstuffs[0], protein: null };

    expect(
      calculateDraftNutrition(
        [{ foodstuffId: incompleteFoodstuff.id, amount: 100 }],
        1,
        [incompleteFoodstuff]
      )
    ).toEqual({
      status: 'incomplete',
      nutrition: { kcal: 370, carbs: 60, protein: null, fat: 7 },
    });
  });

  it('does not calculate a partial or invalid draft', () => {
    expect(
      calculateDraftNutrition([{ foodstuffId: 1, amount: null }], 2, foodstuffs)
    ).toEqual({ status: 'invalid' });
    expect(calculateDraftNutrition([], 2, foodstuffs)).toEqual({
      status: 'empty',
    });
    expect(
      calculateDraftNutrition([{ foodstuffId: 1, amount: 100 }], 0, foodstuffs)
    ).toEqual({ status: 'invalid' });
  });

  it('ignores rows without a selected foodstuff', () => {
    expect(
      calculateDraftNutrition(
        [
          { foodstuffId: 1, amount: 100 },
          { foodstuffId: null, amount: null },
        ],
        2,
        foodstuffs
      )
    ).toEqual({
      status: 'complete',
      nutrition: { kcal: 185, carbs: 30, protein: 6.5, fat: 3.5 },
    });
    expect(
      calculateDraftNutrition([{ foodstuffId: null, amount: null }], 0, foodstuffs)
    ).toEqual({ status: 'empty' });
  });
});
