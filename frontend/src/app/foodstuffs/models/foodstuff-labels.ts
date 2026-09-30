import type { FoodstuffCreate, Unit } from '../../core/api/generated';

export type FoodstuffField = keyof FoodstuffCreate;
export const foodstuffFieldLabels = {
  name: 'Name',
  brand: 'Marke',
  unit: 'Einheit',
  kcal: 'Kalorien',
  carbs: 'Kohlenhydrate',
  protein: 'Proteine',
  fat: 'Fett',
} satisfies Record<FoodstuffField, string>;

const unitLabels = {
  G: 'Gramm',
  ML: 'Milliliter',
  PIECE: 'Stück',
} satisfies Record<Unit, string>;

export const foodstuffUnitChoices = Object.entries(unitLabels).map(([value, label]) => ({ value, label }));

export function foodstuffUnitLabel(unit: Unit): string {
  return unitLabels[unit];
}
