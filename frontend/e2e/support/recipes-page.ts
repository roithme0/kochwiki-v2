import type { Locator, Page } from '@playwright/test';

export class RecipesPage {
  readonly path = '/recipes';
  readonly addButton: Locator;

  constructor(private readonly page: Page) {
    this.addButton = page.getByRole('button', {
      name: 'Rezept hinzufügen',
      exact: true,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path);
  }
}
