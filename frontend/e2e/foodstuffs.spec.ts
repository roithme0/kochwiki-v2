import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import { FoodstuffCreateDialog } from './support/foodstuff-create-dialog';
import { FoodstuffDeleteDialog } from './support/foodstuff-delete-dialog';
import { FoodstuffEditDialog } from './support/foodstuff-edit-dialog';
import { seedFoodstuff } from './support/foodstuff-seed';
import { FoodstuffsPage } from './support/foodstuffs-page';

async function expectUploadedImage(image: Locator): Promise<void> {
  await expect(image).toBeVisible();
  await expect(image).not.toHaveAttribute(
    'src',
    /^(blob:|data:)|question-mark\.png/,
  );
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => ({
        complete: element.complete,
        width: element.naturalWidth,
        height: element.naturalHeight,
      })),
    )
    .toEqual({ complete: true, width: 13, height: 7 });
}

test.describe('Foodstuffs', () => {
  test('authenticated visitor creates a foodstuff and finds it after reload', async ({
    page,
  }) => {
    const name = `E2E Foodstuff ${randomUUID()}`;
    const foodstuffsPage = new FoodstuffsPage(page);
    const createDialog = new FoodstuffCreateDialog(page);

    await foodstuffsPage.goto();
    await foodstuffsPage.expectLoaded();
    await foodstuffsPage.addButton.click();
    await createDialog.create(name, 'Stück');

    await foodstuffsPage.search(name, [name]);

    await page.reload();
    await foodstuffsPage.expectLoaded();
    await foodstuffsPage.search(name, [name]);
  });

  test('authenticated visitor uploads a foodstuff image and sees it after reload', async ({
    page,
    baseURL,
  }) => {
    const name = `E2E image ${randomUUID()}`;
    await seedFoodstuff(page, baseURL, name);
    const foodstuffsPage = new FoodstuffsPage(page);
    const editDialog = new FoodstuffEditDialog(page);
    const imageInput = editDialog.imageInput;

    await foodstuffsPage.goto();
    await foodstuffsPage.expectLoaded();
    await foodstuffsPage.search(name, [name]);
    await foodstuffsPage.editButton(name).click();
    await editDialog.expectLoaded({ name }, 'empty');

    await imageInput.chooseFile(resolve(__dirname, 'fixtures/foodstuff.png'), {
      width: 13,
      height: 7,
    });
    await editDialog.save();
    await expectUploadedImage(foodstuffsPage.image(name));

    await page.reload();
    await foodstuffsPage.expectLoaded();
    await foodstuffsPage.search(name, [name]);
    await expectUploadedImage(foodstuffsPage.image(name));
    await foodstuffsPage.editButton(name).click();
    await editDialog.expectLoaded({ name }, 'image');
    await expectUploadedImage(imageInput.preview);
  });

  test('authenticated visitor edits a foodstuff and sees saved values after reload', async ({
    page,
    baseURL,
  }) => {
    const name = `E2E ${randomUUID()}`;
    const updatedName = `${name} updated`;
    const updatedValues = {
      name: updatedName,
      brand: 'Updated brand',
      unit: 'Gramm',
      kcal: 123,
    };
    await seedFoodstuff(page, baseURL, name);
    const foodstuffsPage = new FoodstuffsPage(page);
    const editDialog = new FoodstuffEditDialog(page);

    await foodstuffsPage.goto();
    await foodstuffsPage.expectLoaded();
    await foodstuffsPage.search(name, [name]);
    await foodstuffsPage.editButton(name).click();
    await editDialog.expectLoaded(
      { name, brand: 'Seed brand', unit: 'Stück', kcal: 42 },
      'empty',
    );

    await editDialog.form.fill(updatedValues);
    await editDialog.expectLoaded(updatedValues, 'empty');
    await editDialog.save();

    await foodstuffsPage.search(updatedName, [updatedName]);
    await foodstuffsPage.search(name, [updatedName]);

    await page.reload();
    await foodstuffsPage.expectLoaded();
    await foodstuffsPage.search(updatedName, [updatedName]);
    await foodstuffsPage.editButton(updatedName).click();
    await editDialog.expectLoaded(updatedValues, 'empty');
  });

  test('authenticated visitor cancels then confirms foodstuff deletion and it stays deleted', async ({
    page,
    baseURL,
  }) => {
    const name = `E2E Delete ${randomUUID()}`;
    await seedFoodstuff(page, baseURL, name);
    const foodstuffsPage = new FoodstuffsPage(page);
    const deleteDialog = new FoodstuffDeleteDialog(page);

    await foodstuffsPage.goto();
    await foodstuffsPage.expectLoaded();
    await foodstuffsPage.search(name, [name]);
    await foodstuffsPage.deleteButton(name).click();
    await deleteDialog.expectLoaded();

    await deleteDialog.cancel();
    await expect(foodstuffsPage.row(name)).toBeVisible();

    await foodstuffsPage.deleteButton(name).click();
    await deleteDialog.expectLoaded();
    await deleteDialog.delete();
    await foodstuffsPage.expectEmpty('filtered');

    await page.reload();
    await foodstuffsPage.expectLoaded();
    await foodstuffsPage.search(name, []);
  });
});
