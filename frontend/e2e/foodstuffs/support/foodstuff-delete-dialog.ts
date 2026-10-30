import { expect, type Locator, type Page } from '@playwright/test';

export class FoodstuffDeleteDialog {
  readonly dialog: Locator;
  readonly heading: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.dialog = page.getByRole('dialog');
    this.heading = this.dialog.getByRole('heading', {
      name: 'Lebensmittel löschen?',
      exact: true,
    });
    this.confirmButton = this.dialog.getByRole('button', {
      name: 'Ja',
      exact: true,
    });
    this.cancelButton = this.dialog.getByRole('button', {
      name: 'Nein',
      exact: true,
    });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.confirmButton).toBeVisible();
    await expect(this.cancelButton).toBeVisible();
  }

  async cancel(): Promise<void> {
    await expect(this.cancelButton).toBeEnabled();
    await this.cancelButton.click();
    await expect(this.dialog).toBeHidden();
  }

  async delete(): Promise<void> {
    await expect(this.confirmButton).toBeEnabled();
    await this.confirmButton.click();
    await expect(this.dialog).toBeHidden();
  }
}
