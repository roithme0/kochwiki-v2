import { expect, test, type Page } from '@playwright/test';
import { IdentityProviderLoginPage } from './support/identity-provider-login-page';
import { LandingPage } from './support/landing-page';
import { SignedOutPage } from './support/signed-out-page';

async function signIn(page: Page): Promise<LandingPage> {
  const landingPage = new LandingPage(page);
  await landingPage.goto();
  await expect(page).toHaveURL(/^http:\/\/localhost:8026\/realms\/services\//);
  const loginPage = new IdentityProviderLoginPage(page);
  await loginPage.signIn('e2e@example.invalid', 'disposable-e2e-password');
  await expect(page).toHaveURL('/');
  return landingPage;
}

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
