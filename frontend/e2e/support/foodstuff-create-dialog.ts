import type { Locator, Page } from '@playwright/test';
import { FoodstuffForm } from './foodstuff-form';

export class FoodstuffCreateDialog {
  readonly dialog: Locator;
  readonly heading: Locator;
  readonly form: FoodstuffForm;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.dialog = page.getByRole('dialog');
    this.heading = this.dialog.getByRole('heading', {
      name: 'Lebensmittel erstellen',
      exact: true,
    });
    this.form = new FoodstuffForm(page, this.dialog);
    this.createButton = this.dialog.getByRole('button', {
      name: 'Erstellen',
      exact: true,
    });
  }
}
