import { expect, type Locator, type Page } from '@playwright/test';
import { PageHeader } from './page-header';

export class RecipesPage {
  readonly path = '/recipes';
  readonly addButton: Locator;
  readonly searchInput: Locator;
  readonly noSearchResultsMessage: Locator;
  readonly noRecipesMessage: Locator;
  readonly deletedMessage: Locator;
  private readonly cards: Locator;
  private readonly pageHeader: PageHeader;

  constructor(private readonly page: Page) {
    this.pageHeader = new PageHeader(page);
    this.cards = page.locator('app-recipes-grid').getByRole('link');
    this.searchInput = page.getByRole('textbox', {
      name: 'Rezepte suchen',
      exact: true,
    });
    this.noSearchResultsMessage = page.getByText(
      'Keine passenden Rezepte gefunden.',
      { exact: true },
    );
    this.noRecipesMessage = page.getByText('Keine Rezepte vorhanden.', {
      exact: true,
    });
    this.deletedMessage = page.getByText('Rezeptlinie gelöscht', {
      exact: true,
    });
    this.addButton = page.getByRole('button', {
      name: 'Rezept hinzufügen',
      exact: true,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(this.path);
    await expect(this.addButton).toBeVisible();
    await expect(this.pageHeader.header).toBeVisible();
    await expect(this.pageHeader.title).toBeVisible();
    await expect(this.pageHeader.title).toHaveText('Rezepte');
  }

  card(name: string): Locator {
    return this.cards.filter({
      has: this.page.getByText(name, { exact: true }),
    });
  }

  async search(query: string, expectedNames: readonly string[]): Promise<void> {
    await this.searchInput.fill(query);
    await expect(this.cards).toHaveCount(expectedNames.length);
    for (const name of expectedNames) {
      await expect(this.card(name)).toHaveCount(1);
      await expect(this.card(name)).toBeVisible();
    }
    if (expectedNames.length === 0) {
      await this.expectEmpty(query.length > 0 ? 'filtered' : 'all');
    } else {
      await expect(this.noSearchResultsMessage).toBeHidden();
    }
  }

  async expectEmpty(state: 'filtered' | 'all'): Promise<void> {
    await expect(this.cards).toHaveCount(0);
    if (state === 'filtered') {
      await expect(this.searchInput).not.toHaveValue('');
      await expect(this.noSearchResultsMessage).toBeVisible();
    } else {
      await expect(this.searchInput).toHaveValue('');
      await expect(this.noRecipesMessage).toBeVisible();
    }
  }

  async expectDeleted(): Promise<void> {
    await this.expectLoaded();
    await expect(this.deletedMessage).toBeVisible();
  }
}
