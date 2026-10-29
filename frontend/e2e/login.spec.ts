import { expect, test } from '@playwright/test';

test('unauthenticated visitor signs in and lands on the homepage', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/^http:\/\/localhost:8026\/realms\/services\//);
  await page.getByLabel('Email', { exact: true }).fill('e2e@example.invalid');
  await page
    .getByLabel('Password', { exact: true })
    .fill('disposable-e2e-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(
    page.getByRole('link', { name: 'Rezepte', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Zutaten', exact: true }),
  ).toBeVisible();
});
