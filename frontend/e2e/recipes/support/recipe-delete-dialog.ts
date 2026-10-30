import { expect, type Locator, type Page } from '@playwright/test';

export class RecipeDeleteDialog {
  readonly dialog: Locator;
  readonly heading: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.dialog = page.getByRole('dialog');
    this.heading = this.dialog.getByRole('heading', {
      name: 'Gesamte Rezeptlinie löschen?',
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

  async delete(): Promise<void> {
    await expect(this.confirmButton).toBeEnabled();
    await this.confirmButton.click();
    await expect(this.dialog).toBeHidden();
  }
}
