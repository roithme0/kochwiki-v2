import { expect, type Locator, type Page } from '@playwright/test';
import { FoodstuffForm, type FoodstuffFormValues } from './foodstuff-form';
import { ImageInput } from './image-input';

export class FoodstuffEditDialog {
  readonly dialog: Locator;
  readonly heading: Locator;
  readonly form: FoodstuffForm;
  readonly imageInput: ImageInput;
  readonly saveButton: Locator;

  constructor(page: Page) {
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
    await this.saveButton.click();
    await expect(this.dialog).toBeHidden();
  }
}
