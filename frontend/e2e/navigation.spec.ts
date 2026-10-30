import { test } from '@playwright/test';
import { FoodstuffsPage } from './support/foodstuffs-page';
import { LandingPage } from './support/landing-page';
import { PageHeader } from './support/page-header';
import { RecipesPage } from './support/recipes-page';

test.describe('Homepage navigation', () => {
  test('opens recipes', async ({ page }) => {
    const landingPage = new LandingPage(page);
    const recipesPage = new RecipesPage(page);
    const pageHeader = new PageHeader(page);

    await landingPage.goto();
    await landingPage.expectLoaded();
    await landingPage.recipesLink.click();

    await recipesPage.expectLoaded();

    await pageHeader.backButton.click();
    await landingPage.expectLoaded();
  });

  test('opens foodstuffs', async ({ page }) => {
    const landingPage = new LandingPage(page);
    const foodstuffsPage = new FoodstuffsPage(page);
    const pageHeader = new PageHeader(page);

    await landingPage.goto();
    await landingPage.expectLoaded();
    await landingPage.ingredientsLink.click();

    await foodstuffsPage.expectLoaded();

    await pageHeader.backButton.click();
    await landingPage.expectLoaded();
  });

  test('home button returns to the homepage from recipes', async ({ page }) => {
    const landingPage = new LandingPage(page);
    const recipesPage = new RecipesPage(page);
    const pageHeader = new PageHeader(page);

    await recipesPage.goto();
    await recipesPage.expectLoaded();

    await pageHeader.homeButton.click();
    await landingPage.expectLoaded();
  });
});
