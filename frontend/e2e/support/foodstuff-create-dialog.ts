import { expect, type Locator, type Page } from '@playwright/test';
import { FoodstuffForm, type FoodstuffFormValues } from './foodstuff-form';
import { ImageInput } from './image-input';

export class FoodstuffCreateDialog {
  readonly dialog: Locator;
  readonly heading: Locator;
  readonly form: FoodstuffForm;
  readonly imageInput: ImageInput;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.dialog = page.getByRole('dialog');
    this.heading = this.dialog.getByRole('heading', {
      name: 'Lebensmittel erstellen',
      exact: true,
    });
    this.form = new FoodstuffForm(page, this.dialog);
    this.imageInput = new ImageInput(page, this.dialog);
    this.createButton = this.dialog.getByRole('button', {
      name: 'Erstellen',
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
    await expect(this.createButton).toBeVisible();
  }

  async create(name: string, unit: string): Promise<void> {
    await this.expectLoaded({ name: '' }, 'empty');
    await expect(this.createButton).toBeDisabled();
    await this.form.fill({ name, unit });
    await this.form.expectValues({ name, unit });
    await expect(this.createButton).toBeEnabled();
    await this.createButton.click();
    await expect(this.dialog).toBeHidden();
  }
}
