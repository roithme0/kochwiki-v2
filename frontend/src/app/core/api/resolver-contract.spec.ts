import * as z from 'zod/mini';
import type { RecipePresentationOut } from './generated';
import { zRecipePresentationOut } from './generated/zod.gen';

const presentation: RecipePresentationOut = {
    servings: 100,
    preptime: null,
    kcal: 99980001,
    carbs: 0,
    protein: null,
    fat: 0,
    ingredients: [{
        index: 100,
        amount: 10000,
        foodstuff: {
            id: 7, name: 'Oats', brand: null, unit: 'G', unitVerbose: 'g',
            kcal: 100, carbs: 0, protein: null, fat: 0,
        },
    }],
    steps: [{ index: 100, description: 'x'.repeat(200) }],
};

describe('generated resolver response validation', () => {
    it('accepts nulls, zero nutrition and values above request limits', () => {
        expect(z.parse(zRecipePresentationOut, presentation)).toEqual(presentation);
    });

    const invalid: RecipePresentationOut[] = [
        { ...presentation, servings: 0 },
        { ...presentation, preptime: 0 },
        { ...presentation, kcal: -1 },
        { ...presentation, ingredients: [{ ...presentation.ingredients[0], index: 0 }] },
        { ...presentation, ingredients: [{ ...presentation.ingredients[0], amount: 0 }] },
        { ...presentation, ingredients: [{ ...presentation.ingredients[0], foodstuff: {
            ...presentation.ingredients[0].foodstuff, fat: -1,
        } }] },
        { ...presentation, steps: [{ index: 0, description: 'Mix' }] },
        { ...presentation, steps: [{ index: 1, description: '' }] },
        { ...presentation, steps: [{ index: 1, description: 'x'.repeat(201) }] },
    ];

    it.each(invalid)('rejects violations of shared response invariants (%#)', (body) => {
        expect(z.safeParse(zRecipePresentationOut, body).success).toBe(false);
    });
});
