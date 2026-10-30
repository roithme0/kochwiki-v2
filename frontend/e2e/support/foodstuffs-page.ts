import type { Locator, Page } from '@playwright/test';

export class FoodstuffsPage {
  readonly path = '/foodstuffs';
  readonly addButton: Locator;
  readonly searchInput: Locator;

  constructor(private readonly page: Page) {
    this.addButton = page.getByRole('button', {
      name: 'Lebensmittel hinzufügen',
      exact: true,
    });
    this.searchInput = page.getByRole('textbox', {
      name: 'Name oder Marke suchen',
      exact: true,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path);
  }

  nameCell(name: string): Locator {
    return this.page.getByRole('cell', { name, exact: true });
  }
}
