import { expect, test } from '@playwright/test';

/**
 * Smoke test: the dispatcher can sign in and reach the live board.
 * Requires the API + seed data running (see docker-compose / README).
 */
test('dispatcher can sign in and see the dispatch board', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Marhaba Dispatch')).toBeVisible();

  await page.getByLabel('Email').fill('dispatcher@marhaba.delivery');
  await page.getByLabel('Password').fill('Password123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Live board')).toBeVisible();
});
