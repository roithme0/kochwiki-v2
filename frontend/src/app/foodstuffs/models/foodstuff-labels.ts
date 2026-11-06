import type { FoodstuffCreate, Unit } from '../../core/api/generated';

export const foodstuffFieldLabels = {
  name: 'Name',
  brand: 'Marke',
  details: 'Details',
  unit: 'Einheit',
  kcal: 'Kalorien',
  carbs: 'Kohlenhydrate',
  protein: 'Proteine',
  fat: 'Fett',
  fiber: 'Ballaststoffe',
} satisfies Record<Exclude<keyof FoodstuffCreate, 'imageId'>, string>;

const unitLabels = {
  G: 'Gramm',
  ML: 'Milliliter',
  PIECE: 'Stück',
} satisfies Record<Unit, string>;

export const foodstuffUnitChoices = Object.entries(unitLabels).map(
  ([value, label]) => ({ value, label }),
);
