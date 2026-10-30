import type { Locator, Page } from '@playwright/test';

export class LandingPage {
  readonly recipesLink: Locator;
  readonly ingredientsLink: Locator;

  constructor(private readonly page: Page) {
    this.recipesLink = page.getByRole('link', { name: 'Rezepte', exact: true });
    this.ingredientsLink = page.getByRole('link', {
      name: 'Zutaten',
      exact: true,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }
}
