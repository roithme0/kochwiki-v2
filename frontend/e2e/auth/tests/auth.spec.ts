import { expect, test } from '@playwright/test';
import { signIn } from '../support/authentication';
import { PageHeader } from '../../shared/support/page-header';
import { SignedOutPage } from '../support/signed-out-page';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('unauthenticated visitor signs in and lands on the homepage', async ({
    page,
  }) => {
    const landingPage = await signIn(page);
    await landingPage.expectLoaded();

    const pageHeader = new PageHeader(page);
    await pageHeader.expectActiveUser('E2E User');
  });

  test('authenticated visitor signs out and stays signed out after reload', async ({
    page,
  }) => {
    await signIn(page);

    const pageHeader = new PageHeader(page);
    const signedOutPage = new SignedOutPage(page);

    await pageHeader.signOut();
    await signedOutPage.expectLoaded();
    await expect(pageHeader.userOptionsButton).toHaveCount(0);

    await page.reload();
    await signedOutPage.expectLoaded();
    await expect(pageHeader.userOptionsButton).toHaveCount(0);

    const session = await page.request.get('/api/auth/me');
    expect(session.status()).toBe(401);
  });
});
