import { expect, type Locator, type Page } from '@playwright/test';
import { PageHeader } from '../../shared/support/page-header';

export class LandingPage {
  readonly path = '/';
  readonly recipesLink: Locator;
  readonly ingredientsLink: Locator;
  private readonly pageHeader: PageHeader;

  constructor(private readonly page: Page) {
    this.pageHeader = new PageHeader(page);
    this.recipesLink = page.getByRole('link', { name: 'Rezepte', exact: true });
    this.ingredientsLink = page.getByRole('link', {
      name: 'Zutaten',
      exact: true,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(this.path);
    await expect(this.pageHeader.header).toBeVisible();
    await expect(this.pageHeader.title).toBeVisible();
    await expect(this.pageHeader.title).toHaveText('Kochwiki');
    await expect(this.recipesLink).toBeVisible();
    await expect(this.ingredientsLink).toBeVisible();
  }
}
