import { expect, type Locator, type Page } from '@playwright/test';

export class SignedOutPage {
  readonly path = '/signed-out';
  readonly message: Locator;
  readonly signInButton: Locator;

  constructor(private readonly page: Page) {
    this.message = page.getByText('Du bist abgemeldet.', { exact: true });
    this.signInButton = page.getByRole('button', {
      name: 'Anmelden',
      exact: true,
    });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(this.path);
    await expect(this.message).toBeVisible();
    await expect(this.signInButton).toBeVisible();
  }
}
