import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { FoodstuffCreateDialog } from './support/foodstuff-create-dialog';
import { FoodstuffsPage } from './support/foodstuffs-page';

test.describe('Foodstuff creation', () => {
  test('authenticated visitor creates a foodstuff and finds it after reload', async ({
    page,
  }) => {
    const name = `E2E Foodstuff ${randomUUID()}`;
    const foodstuffsPage = new FoodstuffsPage(page);
    const createDialog = new FoodstuffCreateDialog(page);

    await foodstuffsPage.goto();
    await expect(page).toHaveURL(foodstuffsPage.path);
    await foodstuffsPage.addButton.click();
    await expect(createDialog.heading).toBeVisible();
    await expect(createDialog.createButton).toBeDisabled();
    await createDialog.form.nameInput.fill(name);
    await createDialog.form.chooseUnit('Stück');
    await expect(createDialog.createButton).toBeEnabled();
    await createDialog.createButton.click();
    await expect(createDialog.dialog).toBeHidden();

    await foodstuffsPage.searchInput.fill(name);
    await expect(foodstuffsPage.nameCell(name)).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(foodstuffsPage.path);
    await foodstuffsPage.searchInput.fill(name);
    await expect(foodstuffsPage.nameCell(name)).toBeVisible();
  });
});
