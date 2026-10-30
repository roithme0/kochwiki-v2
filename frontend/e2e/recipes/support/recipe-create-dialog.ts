import { expect, type Locator, type Page } from '@playwright/test';
import { ImageInput } from '../../shared/support/image-input';
import { RecipeForm, type RecipeFormValues } from './recipe-form';

export class RecipeCreateDialog {
  readonly dialog: Locator;
  readonly heading: Locator;
  readonly form: RecipeForm;
  readonly imageInput: ImageInput;
  readonly saveButton: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.getByRole('dialog');
    this.heading = this.dialog.getByRole('heading', {
      name: 'Rezept erstellen',
      exact: true,
    });
    this.form = new RecipeForm(this.dialog);
    this.imageInput = new ImageInput(page, this.dialog);
    this.saveButton = this.dialog.getByRole('button', {
      name: 'Speichern',
      exact: true,
    });
  }

  async expectLoaded(
    values: Partial<RecipeFormValues>,
    imageState: 'empty' | 'image',
  ): Promise<void> {
    await expect(this.heading).toBeVisible();
    await this.form.expectValues(values);
    await this.imageInput.expectLoaded(imageState);
    await expect(this.saveButton).toBeVisible();
  }

  async save(): Promise<void> {
    await expect(this.saveButton).toBeEnabled();
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/api/recipes',
      ),
      this.saveButton.click(),
    ]);
    expect(response.status()).toBe(201);
    await expect(this.dialog).toBeHidden();
  }

  async create(
    values: Pick<RecipeFormValues, 'name'> & Partial<RecipeFormValues>,
  ): Promise<void> {
    await this.expectLoaded({ name: '', servings: 2 }, 'empty');
    await this.form.fill(values);
    await this.form.expectValues(values);
    await this.save();
  }
}
