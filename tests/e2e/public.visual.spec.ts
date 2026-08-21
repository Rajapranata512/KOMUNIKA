import { expect, test } from '@playwright/test';

test('public homepage retains its scholarly visual baseline', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('public-home.png', { fullPage: true, caret: 'initial' });
});

test('login retains its branded visual baseline', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveScreenshot('login.png', { fullPage: true, caret: 'initial' });
});
