import { expect, type Locator, type Page } from '@playwright/test';
import { PageHeader } from './page-header';
import type { RecipeFormValues } from './recipe-form';

export class RecipePage {
  readonly editButton: Locator;
  readonly deleteButton: Locator;
  readonly image: Locator;
  readonly notFoundMessage: Locator;
  private readonly pageHeader: PageHeader;

  constructor(private readonly page: Page) {
    this.pageHeader = new PageHeader(page);
    this.editButton = page.getByRole('button', {
      name: 'edit icon',
      exact: true,
    });
    this.deleteButton = page.getByRole('button', {
      name: 'Rezeptlinie löschen',
      exact: true,
    });
    this.image = page.getByRole('img', { name: 'Rezeptbild', exact: true });
    this.notFoundMessage = page.getByText('Rezept nicht gefunden.', {
      exact: true,
    });
  }

  get url(): string {
    return this.page.url();
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async expectLoaded(values: RecipeFormValues, url?: string): Promise<void> {
    await expect(this.page).toHaveURL(url ?? /\/recipes\/[0-9a-f-]+$/);
    await expect(this.pageHeader.header).toBeVisible();
    await expect(this.pageHeader.title).toBeVisible();
    await expect(this.pageHeader.title).toHaveText(values.name);
    await expect(
      this.page.getByText(`${values.servings} Portionen`, { exact: true }),
    ).toBeVisible();
    await expect(this.editButton).toBeVisible();
  }

  async expectImageDimensions(width: number, height: number): Promise<void> {
    await expect(this.image).toBeVisible();
    await expect(this.image).toHaveJSProperty('naturalWidth', width);
    await expect(this.image).toHaveJSProperty('naturalHeight', height);
  }

  async expectNotFound(name: string): Promise<void> {
    await expect(this.notFoundMessage).toBeVisible();
    await expect(this.page.getByText(name, { exact: true })).toHaveCount(0);
    await expect(this.deleteButton).toHaveCount(0);
  }
}
