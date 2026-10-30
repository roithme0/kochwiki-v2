import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from '@playwright/test';
import { expectUploadedImage } from '../../shared/support/uploaded-image';
import { RecipeCreateDialog } from '../support/recipe-create-dialog';
import { RecipeDeleteDialog } from '../support/recipe-delete-dialog';
import { RecipeEditDialog } from '../support/recipe-edit-dialog';
import { RecipePage } from '../support/recipe-page';
import { RecipesPage } from '../support/recipes-page';

test.describe('Recipe management', () => {
  test('creates-minimal-recipe-and-persists-after-reload', async ({ page }) => {
    const values = { name: `E2E Recipe ${randomUUID()}`, servings: 2 };
    const recipesPage = new RecipesPage(page);
    const recipePage = new RecipePage(page);
    const createDialog = new RecipeCreateDialog(page);

    await recipesPage.goto();
    await recipesPage.expectLoaded();
    await recipesPage.addButton.click();
    await createDialog.create({ name: values.name });
    await recipePage.expectLoaded(values);
    const recipeUrl = recipePage.url;

    await page.reload();
    await recipePage.expectLoaded(values, recipeUrl);

    await recipesPage.goto();
    await recipesPage.expectLoaded();
    await recipesPage.search(values.name, [values.name]);
    await recipesPage.card(values.name).click();
    await recipePage.expectLoaded(values, recipeUrl);
  });

  test('uploads-png-and-renders-after-reload', async ({ page }) => {
    const values = { name: `E2E Recipe Image ${randomUUID()}`, servings: 2 };
    const recipesPage = new RecipesPage(page);
    const recipePage = new RecipePage(page);
    const createDialog = new RecipeCreateDialog(page);

    await recipesPage.goto();
    await recipesPage.expectLoaded();
    await recipesPage.addButton.click();
    await createDialog.expectLoaded({ name: '', servings: 2 }, 'empty');
    await createDialog.form.fill({ name: values.name });
    await createDialog.imageInput.chooseFile(
      resolve(__dirname, '../../shared/fixtures/upload.png'),
      {
        width: 13,
        height: 7,
      },
    );
    await createDialog.save();
    await recipePage.expectLoaded(values);
    const recipeUrl = recipePage.url;
    await expectUploadedImage(recipePage.image, 13, 7);

    await page.reload();
    await recipePage.expectLoaded(values, recipeUrl);
    await expectUploadedImage(recipePage.image, 13, 7);
  });

  test('updates-recipe-and-persists-after-reload', async ({ page }) => {
    const values = { name: `E2E Recipe Update ${randomUUID()}`, servings: 2 };
    const updatedValues = { name: `${values.name} updated`, servings: 4 };
    const recipesPage = new RecipesPage(page);
    const recipePage = new RecipePage(page);
    const createDialog = new RecipeCreateDialog(page);
    const editDialog = new RecipeEditDialog(page);

    await recipesPage.goto();
    await recipesPage.expectLoaded();
    await recipesPage.addButton.click();
    await createDialog.create({ name: values.name });
    await recipePage.expectLoaded(values);
    const recipeUrl = recipePage.url;

    await recipePage.editButton.click();
    await editDialog.expectLoaded(values, 'empty');
    await editDialog.form.fill(updatedValues);
    await editDialog.expectLoaded(updatedValues, 'empty');
    await editDialog.save();
    await recipePage.expectLoaded(updatedValues, recipeUrl);

    await page.reload();
    await recipePage.expectLoaded(updatedValues, recipeUrl);
    await recipePage.editButton.click();
    await editDialog.expectLoaded(updatedValues, 'empty');
  });

  test('deletes-recipe-and-removes-access', async ({ page }) => {
    const values = { name: `E2E Recipe Delete ${randomUUID()}`, servings: 2 };
    const recipesPage = new RecipesPage(page);
    const recipePage = new RecipePage(page);
    const createDialog = new RecipeCreateDialog(page);
    const deleteDialog = new RecipeDeleteDialog(page);

    await recipesPage.goto();
    await recipesPage.expectLoaded();
    await recipesPage.addButton.click();
    await createDialog.create({ name: values.name });
    await recipePage.expectLoaded(values);
    const recipeUrl = recipePage.url;

    await recipePage.deleteButton.click();
    await deleteDialog.expectLoaded();
    await deleteDialog.delete();
    await recipesPage.expectDeleted();
    await recipesPage.search(values.name, []);

    await page.reload();
    await recipesPage.expectLoaded();
    await recipesPage.search(values.name, []);

    await recipePage.goto(recipeUrl);
    await recipePage.expectNotFound(values.name);
  });
});
