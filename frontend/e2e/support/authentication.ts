import { expect, type Page } from '@playwright/test';
import { IdentityProviderLoginPage } from './identity-provider-login-page';
import { LandingPage } from './landing-page';

export async function signIn(page: Page): Promise<LandingPage> {
  const landingPage = new LandingPage(page);
  await landingPage.goto();
  await expect(page).toHaveURL(/^http:\/\/localhost:8026\/realms\/services\//);
  const loginPage = new IdentityProviderLoginPage(page);
  await loginPage.signIn('e2e@example.invalid', 'disposable-e2e-password');
  await expect(page).toHaveURL(landingPage.path);
  return landingPage;
}
