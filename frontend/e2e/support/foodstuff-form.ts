import { expect, type Locator, type Page } from '@playwright/test';

export interface FoodstuffFormValues {
  readonly name: string;
  readonly unit: string;
  readonly brand: string;
  readonly kcal: number;
}

export class FoodstuffForm {
  readonly nameInput: Locator;
  readonly unitSelect: Locator;
  readonly brandInput: Locator;
  readonly kcalInput: Locator;

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
    this.brandInput = container.getByRole('textbox', {
      name: 'Marke',
      exact: true,
    });
    this.kcalInput = container.getByRole('spinbutton', {
      name: 'Kalorien',
      exact: true,
    });
  }

  async fill(values: Partial<FoodstuffFormValues>): Promise<void> {
    if (values.name !== undefined) {
      await this.nameInput.fill(values.name);
    }
    if (values.unit !== undefined) {
      await this.chooseUnit(values.unit);
    }
    if (values.brand !== undefined) {
      await this.brandInput.fill(values.brand);
    }
    if (values.kcal !== undefined) {
      await this.kcalInput.fill(String(values.kcal));
    }
  }

  async expectValues(expected: Partial<FoodstuffFormValues>): Promise<void> {
    if (expected.name !== undefined) {
      await expect(this.nameInput).toHaveValue(expected.name);
    }
    if (expected.unit !== undefined) {
      await expect(this.unitSelect).toHaveText(expected.unit);
    }
    if (expected.brand !== undefined) {
      await expect(this.brandInput).toHaveValue(expected.brand);
    }
    if (expected.kcal !== undefined) {
      await expect(this.kcalInput).toHaveValue(String(expected.kcal));
    }
  }

  async chooseUnit(unit: string): Promise<void> {
    await this.unitSelect.click();
    await this.page.getByRole('option', { name: unit, exact: true }).click();
  }
}
