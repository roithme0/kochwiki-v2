import { expect, type Locator } from '@playwright/test';

export interface RecipeFormValues {
  readonly name: string;
  readonly servings: number;
}

export class RecipeForm {
  readonly nameInput: Locator;
  readonly servingsInput: Locator;

  constructor(container: Locator) {
    this.nameInput = container.getByRole('textbox', {
      name: 'Name',
      exact: true,
    });
    this.servingsInput = container.getByRole('spinbutton', {
      name: 'Portionen',
      exact: true,
    });
  }

  async fill(values: Partial<RecipeFormValues>): Promise<void> {
    if (values.name !== undefined) await this.nameInput.fill(values.name);
    if (values.servings !== undefined) {
      await this.servingsInput.fill(String(values.servings));
    }
  }

  async expectValues(values: Partial<RecipeFormValues>): Promise<void> {
    if (values.name !== undefined)
      await expect(this.nameInput).toHaveValue(values.name);
    if (values.servings !== undefined) {
      await expect(this.servingsInput).toHaveValue(String(values.servings));
    }
  }
}
