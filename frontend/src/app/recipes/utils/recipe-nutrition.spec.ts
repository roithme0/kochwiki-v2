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
    expect(
      calculateDraftNutrition(
        [
          { foodstuffId: 1, amount: 200 },
          { foodstuffId: 2, amount: 2 },
          { foodstuffId: 3, amount: 200 },
        ],
        2,
        foodstuffs,
      ),
    ).toEqual({
      status: 'ready',
      nutrition: {
        kcal: { status: 'exact', value: 500 },
        carbs: { status: 'exact', value: 66 },
        protein: { status: 'exact', value: 23 },
        fat: { status: 'exact', value: 14 },
      },
    });
  });

  it('tracks completeness independently for each nutrient', () => {
    expect(
      calculateDraftNutrition(
        [
          { foodstuffId: 1, amount: 100 },
          { foodstuffId: 2, amount: 2 },
        ],
        2,
        [foodstuffs[0], { ...foodstuffs[1], protein: null, kcal: null }],
      ),
    ).toEqual({
      status: 'ready',
      nutrition: {
        kcal: { status: 'minimum', value: 185 },
        carbs: { status: 'exact', value: 31 },
        protein: { status: 'minimum', value: 6.5 },
        fat: { status: 'exact', value: 8.5 },
      },
    });
  });

  it.each([
    [FoodstuffUnit.Gram, 200],
    [FoodstuffUnit.Milliliter, 200],
    [FoodstuffUnit.Piece, 2],
  ])('matches backend known-plus-missing cases for unit %s', (unit, amount) => {
    const known = {
      ...foodstuffs[0],
      unit,
      kcal: 25,
      carbs: 25,
      protein: 25,
      fat: 25,
    };
    const missing = {
      ...known,
      id: 2,
      kcal: null,
      carbs: null,
      protein: null,
      fat: null,
    };
    const ingredients = [
      { foodstuffId: 1, amount },
      { foodstuffId: 2, amount: 100 },
    ];
    for (const rows of [ingredients, [...ingredients].reverse()]) {
      expect(calculateDraftNutrition(rows, 2, [known, missing])).toEqual(
        uniformResult('minimum', 25),
      );
    }
    expect(calculateDraftNutrition([ingredients[0]], 2, [known])).toEqual(
      uniformResult('exact', 25),
    );
  });

  it('distinguishes unknown, exact zero and minimum zero', () => {
    const zero = { ...foodstuffs[0], kcal: 0, carbs: 0, protein: 0, fat: 0 };
    const missing = {
      ...zero,
      id: 2,
      kcal: null,
      carbs: null,
      protein: null,
      fat: null,
    };
    expect(calculateDraftNutrition([], 2, [zero])).toEqual(
      uniformResult('unknown', null),
    );
    expect(
      calculateDraftNutrition([{ foodstuffId: 2, amount: 100 }], 2, [missing]),
    ).toEqual(uniformResult('unknown', null));
    expect(
      calculateDraftNutrition([{ foodstuffId: 1, amount: 100 }], 2, [zero]),
    ).toEqual(uniformResult('exact', 0));
    expect(
      calculateDraftNutrition(
        [
          { foodstuffId: 1, amount: 100 },
          { foodstuffId: 2, amount: 100 },
        ],
        2,
        [zero, missing],
      ),
    ).toEqual(uniformResult('minimum', 0));
  });

  it.each([null, 0, -1, 10000, NaN, Infinity])(
    'treats invalid amount %s as an unknown contribution',
    (amount) => {
      const known = {
        ...foodstuffs[0],
        kcal: 20,
        carbs: 20,
        protein: 20,
        fat: 20,
      };
      expect(
        calculateDraftNutrition(
          [
            { foodstuffId: 1, amount: 100 },
            { foodstuffId: 1, amount },
          ],
          2,
          [known],
        ),
      ).toEqual(uniformResult('minimum', 10));
      expect(
        calculateDraftNutrition([{ foodstuffId: 1, amount }], 2, [known]),
      ).toEqual(uniformResult('unknown', null));
    },
  );

  it.each([null, 0, -1, 1.5, 100, NaN, Infinity])(
    'does not show per-serving results with invalid servings %s',
    (servings) => {
      expect(
        calculateDraftNutrition(
          [{ foodstuffId: 1, amount: 100 }],
          servings,
          foodstuffs,
        ),
      ).toEqual({ status: 'invalid' });
      expect(calculateDraftNutrition([], servings, foodstuffs)).toEqual({
        status: 'invalid',
      });
    },
  );

  it('ignores unselected rows and treats unresolved selections as unknown', () => {
    const selected = [{ foodstuffId: 1, amount: 100 }];
    expect(
      calculateDraftNutrition(
        [...selected, { foodstuffId: null, amount: null }],
        2,
        foodstuffs,
      ),
    ).toEqual(calculateDraftNutrition(selected, 2, foodstuffs));
    expect(
      calculateDraftNutrition(
        [{ foodstuffId: null, amount: 100 }],
        2,
        foodstuffs,
      ),
    ).toEqual(uniformResult('unknown', null));
    expect(
      calculateDraftNutrition(
        [{ foodstuffId: 99, amount: 100 }],
        2,
        foodstuffs,
      ),
    ).toEqual(uniformResult('unknown', null));
  });
});

function uniformResult(
  status: 'exact' | 'minimum' | 'unknown',
  value: number | null,
): object {
  return {
    status: 'ready',
    nutrition: {
      kcal: { status, value },
      carbs: { status, value },
      protein: { status, value },
      fat: { status, value },
    },
  };
}
