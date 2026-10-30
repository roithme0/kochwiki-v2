import type { Locator, Page } from '@playwright/test';

export class SignedOutPage {
  readonly message: Locator;
  readonly signInButton: Locator;

  constructor(page: Page) {
    this.message = page.getByText('Du bist abgemeldet.', { exact: true });
    this.signInButton = page.getByRole('button', {
      name: 'Anmelden',
      exact: true,
    });
  }
}
