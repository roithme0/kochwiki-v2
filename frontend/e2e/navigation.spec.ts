import { expect, test } from '@playwright/test';
import { FoodstuffsPage } from './support/foodstuffs-page';
import { LandingPage } from './support/landing-page';
import { RecipesPage } from './support/recipes-page';

test.describe('Homepage navigation', () => {
  test('opens recipes', async ({ page }) => {
    const landingPage = new LandingPage(page);
    const recipesPage = new RecipesPage(page);

    await landingPage.goto();
    await landingPage.recipesLink.click();

    await expect(page).toHaveURL(recipesPage.path);
    await expect(recipesPage.addButton).toBeVisible();
  });

  test('opens foodstuffs', async ({ page }) => {
    const landingPage = new LandingPage(page);
    const foodstuffsPage = new FoodstuffsPage(page);

    await landingPage.goto();
    await landingPage.ingredientsLink.click();

    await expect(page).toHaveURL(foodstuffsPage.path);
    await expect(foodstuffsPage.addButton).toBeVisible();
  });
});
