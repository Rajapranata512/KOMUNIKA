import { expect, test } from '@playwright/test';

test('reader can navigate the public discovery pages', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kelola penerbitan jurnal');

  await page.getByRole('link', { name: 'Jelajahi jurnal' }).click();
  await expect(page).toHaveURL(/\/journals$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Jurnal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Jurnal yang tersedia' })).toBeVisible();

  await page.getByRole('link', { name: 'Cari' }).click();
  await page.getByLabel('Kata pencarian').fill('metadata');
  await page.getByRole('button', { name: 'Cari artikel' }).click();
  await expect(page).toHaveURL(/\/search\?q=metadata/);
  await expect(page.getByText(/0 hasil untuk/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tidak ada artikel yang cocok' })).toBeVisible();
});

test('canonical login presents one identity entry point', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Masuk' })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('autocomplete', 'username');
  await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByRole('link', { name: 'Buat akun' })).toHaveAttribute('href', '/register');
  await expect(page.getByRole('link', { name: 'Lupa password?' })).toHaveAttribute(
    'href',
    '/forgot-password',
  );
});
