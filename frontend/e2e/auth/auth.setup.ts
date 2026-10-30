import { expect, test as setup } from '@playwright/test';
import { authenticatedStatePath } from './support/auth-state';
import { signIn } from './support/authentication';

setup('authenticate feature tests', async ({ page, browser, baseURL }) => {
  const landingPage = await signIn(page);
  await expect(landingPage.ingredientsLink).toBeVisible();
  await page.context().storageState({ path: authenticatedStatePath });

  const context = await browser.newContext({
    baseURL,
    storageState: authenticatedStatePath,
  });
  try {
    const session = await context.request.get('/api/auth/me');
    expect(session.status()).toBe(200);
  } finally {
    await context.close();
  }
});
