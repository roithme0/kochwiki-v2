import * as z from 'zod/mini';
import {
  zFoodstuffOut,
  zFoodstuffSummaryOut,
  zRecipeVersionOut,
} from '../core/api/generated/zod.gen';
import { foodstuffOut, foodstuffSummary } from './foodstuff.fixtures';
import { nutritionSummary } from './nutrition.fixtures';
import { recipePresentation, recipeVersionOut } from './recipe.fixtures';

describe('test fixture factories', () => {
  it('provides valid API defaults', () => {
    expect(z.safeParse(zFoodstuffSummaryOut, foodstuffSummary()).success).toBe(
      true,
    );
    expect(z.safeParse(zFoodstuffOut, foodstuffOut()).success).toBe(true);
    expect(z.safeParse(zRecipeVersionOut, recipeVersionOut()).success).toBe(
      true,
    );
  });

  it('detaches mutable foodstuff and nutrition overrides on every call', () => {
    const recipeVersionIds = ['00000000-0000-4000-8000-000000000002'];
    const first = foodstuffOut({ recipeVersionIds });
    const second = foodstuffOut({ recipeVersionIds });
    first.recipeVersionIds.push('00000000-0000-4000-8000-000000000003');
    expect(second.recipeVersionIds).toEqual(recipeVersionIds);
    expect(recipeVersionIds).toHaveLength(1);

    const overrides = nutritionSummary({
      kcal: { status: 'exact', value: 10 },
    });
    const nutrition = nutritionSummary(overrides);
    nutrition.kcal.value = 20;
    expect(overrides.kcal.value).toBe(10);
    expect(nutritionSummary().kcal.value).toBeNull();
    expect(nutritionSummary().kcal).not.toBe(nutritionSummary().kcal);
  });

  it('detaches nested recipe values from overrides and other calls', () => {
    const overrides = recipeVersionOut({
      kcal: { status: 'exact', value: 10 },
      imageDimensions: { width: 100, height: 200 },
      ingredients: [
        {
          id: 1,
          index: 1,
          amount: 100,
          recipeVersionId: '00000000-0000-4000-8000-000000000002',
          foodstuff: foodstuffSummary({ name: 'Oats' }),
        },
      ],
      steps: [
        {
          id: 1,
          index: 1,
          description: 'Cook',
          recipeVersionId: '00000000-0000-4000-8000-000000000002',
        },
      ],
    });
    const first = recipeVersionOut(overrides);
    const second = recipeVersionOut(overrides);
    first.ingredients[0].foodstuff.name = 'Changed';
    first.steps[0].description = 'Changed';
    if (first.kcal.status === 'exact') first.kcal.value = 20;
    expect(second).toEqual(overrides);
    expect(first.imageDimensions).not.toBe(overrides.imageDimensions);
    expect(first.kcal).not.toBe(overrides.kcal);
    expect(recipeVersionOut().ingredients).not.toBe(
      recipeVersionOut().ingredients,
    );

    const presentation = recipePresentation({
      ingredients: overrides.ingredients,
      steps: overrides.steps,
    });
    expect(presentation.ingredients).not.toBe(overrides.ingredients);
    expect(presentation.ingredients[0].foodstuff).not.toBe(
      overrides.ingredients[0].foodstuff,
    );
    expect(presentation.steps[0]).not.toBe(overrides.steps[0]);
    expect(recipePresentation().fiber).not.toBe(recipePresentation().fiber);
  });
});
