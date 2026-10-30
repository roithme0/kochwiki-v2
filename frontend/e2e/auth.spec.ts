import { expect, test } from '@playwright/test';
import { signIn } from './support/authentication';
import { SignedOutPage } from './support/signed-out-page';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('unauthenticated visitor signs in and lands on the homepage', async ({
    page,
  }) => {
    const landingPage = await signIn(page);
    await expect(landingPage.recipesLink).toBeVisible();
    await expect(landingPage.ingredientsLink).toBeVisible();
  });

  test('authenticated visitor signs out and stays signed out after reload', async ({
    page,
  }) => {
    await signIn(page);

    const userOptions = page.getByRole('button', {
      name: 'Benutzeroptionen öffnen',
      exact: true,
    });
    const signedOutPage = new SignedOutPage(page);

    await userOptions.click();
    await page.getByRole('menuitem', { name: 'Abmelden', exact: true }).click();
    await expect(page).toHaveURL('/signed-out');
    await expect(signedOutPage.message).toBeVisible();
    await expect(signedOutPage.signInButton).toBeVisible();
    await expect(userOptions).toHaveCount(0);

    await page.reload();
    await expect(page).toHaveURL('/signed-out');
    await expect(signedOutPage.message).toBeVisible();
    await expect(signedOutPage.signInButton).toBeVisible();
    await expect(userOptions).toHaveCount(0);

    const session = await page.request.get('/api/auth/me');
    expect(session.status()).toBe(401);
  });
});
