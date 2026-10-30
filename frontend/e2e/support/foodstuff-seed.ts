import { expect, type Page } from '@playwright/test';
import type {
  FoodstuffCreate,
  FoodstuffOut,
} from '../../src/app/core/api/generated';
import { zFoodstuffOut } from '../../src/app/core/api/generated/zod.gen';

export async function seedFoodstuff(
  page: Page,
  baseURL: string | undefined,
  name: string,
): Promise<FoodstuffOut> {
  if (!baseURL) {
    throw new Error('Foodstuff setup requires a Playwright baseURL');
  }
  const foodstuff: FoodstuffCreate = {
    name,
    unit: 'PIECE',
    brand: 'Seed brand',
    kcal: 42,
  };
  const response = await page.request.post('/api/foodstuffs', {
    headers: { Origin: new URL(baseURL).origin },
    data: foodstuff,
  });
  expect(
    response.status(),
    'Foodstuff setup should create its own record',
  ).toBe(201);
  const body: unknown = await response.json();
  return zFoodstuffOut.parse(body);
}
