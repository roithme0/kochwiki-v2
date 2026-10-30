import type { Locator, Page } from '@playwright/test';

export class FoodstuffForm {
  readonly nameInput: Locator;
  readonly unitSelect: Locator;

  constructor(
    private readonly page: Page,
    container: Locator,
  ) {
    this.nameInput = container.getByRole('textbox', {
      name: 'Name',
      exact: true,
    });
    this.unitSelect = container.getByRole('combobox', {
      name: 'Einheit',
      exact: true,
    });
  }

  async chooseUnit(unit: string): Promise<void> {
    await this.unitSelect.click();
    await this.page.getByRole('option', { name: unit, exact: true }).click();
  }
}
