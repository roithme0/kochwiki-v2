import { expect, type Locator, type Page } from '@playwright/test';
import { FoodstuffForm, type FoodstuffFormValues } from './foodstuff-form';
import { ImageInput } from '../../shared/support/image-input';

export class FoodstuffEditDialog {
  readonly dialog: Locator;
  readonly heading: Locator;
  readonly form: FoodstuffForm;
  readonly imageInput: ImageInput;
  readonly saveButton: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.getByRole('dialog');
    this.heading = this.dialog.getByRole('heading', {
      name: 'Lebensmittel bearbeiten',
      exact: true,
    });
    this.form = new FoodstuffForm(page, this.dialog);
    this.imageInput = new ImageInput(page, this.dialog);
    this.saveButton = this.dialog.getByRole('button', {
      name: 'Speichern',
      exact: true,
    });
  }

  async expectLoaded(
    values: Partial<FoodstuffFormValues>,
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
          response.request().method() === 'PATCH' &&
          /^\/api\/foodstuffs\/\d+$/.test(new URL(response.url()).pathname),
      ),
      this.saveButton.click(),
    ]);
    expect(response.status()).toBe(200);
    await expect(this.dialog).toBeHidden();
  }
}
