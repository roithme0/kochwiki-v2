import { expect, type Locator, type Page } from '@playwright/test';

export class PageHeader {
  readonly header: Locator;
  readonly title: Locator;
  readonly backButton: Locator;
  readonly homeButton: Locator;
  readonly userOptionsButton: Locator;
  readonly activeUser: Locator;
  readonly signOutMenuItem: Locator;

  constructor(page: Page) {
    this.header = page.locator('app-page-header');
    this.title = this.header.getByRole('heading', { level: 1 });
    this.backButton = this.header.getByRole('button', {
      name: 'Zurück',
      exact: true,
    });
    this.homeButton = this.header.getByRole('button', {
      name: 'Home',
      exact: true,
    });
    this.userOptionsButton = page.getByRole('button', {
      name: 'Benutzeroptionen öffnen',
      exact: true,
    });
    const userOptionsMenu = page.getByRole('menu');
    this.activeUser = userOptionsMenu.getByLabel('Aktiver Benutzer', {
      exact: true,
    });
    this.signOutMenuItem = userOptionsMenu.getByRole('menuitem', {
      name: 'Abmelden',
      exact: true,
    });
  }

  async expectActiveUser(name: string): Promise<void> {
    await this.userOptionsButton.click();
    await expect(this.activeUser).toBeVisible();
    await expect(this.activeUser).toHaveText(name);
  }

  async signOut(): Promise<void> {
    await this.userOptionsButton.click();
    await this.signOutMenuItem.click();
  }
}
