import { expect, type Locator, type Page } from '@playwright/test';
import { PageHeader } from '../../shared/support/page-header';

export class FoodstuffsPage {
  readonly path = '/foodstuffs';
  readonly addButton: Locator;
  readonly searchInput: Locator;
  readonly noSearchResultsMessage: Locator;
  readonly noFoodstuffsMessage: Locator;
  private readonly rows: Locator;
  private readonly pageHeader: PageHeader;

  constructor(private readonly page: Page) {
    this.pageHeader = new PageHeader(page);
    this.rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
    this.addButton = page.getByRole('button', {
      name: 'Lebensmittel hinzufügen',
      exact: true,
    });
    this.searchInput = page.getByRole('textbox', {
      name: 'Name oder Marke suchen',
      exact: true,
    });
    this.noSearchResultsMessage = page.getByText(
      'Keine passenden Lebensmittel gefunden.',
      {
        exact: true,
      },
    );
    this.noFoodstuffsMessage = page.getByText('Keine Lebensmittel vorhanden.', {
      exact: true,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path);
  }

  async search(query: string, expectedNames: readonly string[]): Promise<void> {
    await this.searchInput.fill(query);
    await expect(this.rows).toHaveCount(expectedNames.length);
    for (const name of expectedNames) {
      await expect(this.row(name)).toHaveCount(1);
      await expect(this.nameCell(name)).toBeVisible();
    }
    if (expectedNames.length === 0) {
      await this.expectEmpty(query.length > 0 ? 'filtered' : 'all');
    } else {
      await expect(this.noSearchResultsMessage).toBeHidden();
    }
  }

  async expectEmpty(state: 'filtered' | 'all'): Promise<void> {
    await expect(this.rows).toHaveCount(0);
    if (state === 'filtered') {
      await expect(this.searchInput).not.toHaveValue('');
      await expect(this.noSearchResultsMessage).toBeVisible();
    } else {
      await expect(this.searchInput).toHaveValue('');
      await expect(this.noFoodstuffsMessage).toBeVisible();
    }
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(this.path);
    await expect(this.addButton).toBeVisible();
    await expect(this.pageHeader.header).toBeVisible();
    await expect(this.pageHeader.title).toBeVisible();
    await expect(this.pageHeader.title).toHaveText('Lebensmittel');
  }

  nameCell(name: string): Locator {
    return this.page.getByRole('cell', { name, exact: true });
  }

  row(name: string): Locator {
    return this.page.getByRole('row').filter({ has: this.nameCell(name) });
  }

  editButton(name: string): Locator {
    return this.row(name).getByRole('button', {
      name: 'Bearbeiten',
      exact: true,
    });
  }

  deleteButton(name: string): Locator {
    return this.row(name).getByRole('button', { name: 'Löschen', exact: true });
  }

  image(name: string): Locator {
    return this.row(name).locator('img[src^="/storage/"]');
  }
}
