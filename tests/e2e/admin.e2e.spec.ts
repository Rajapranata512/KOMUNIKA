import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { database } from '../../packages/database/src/index.js';

const apiBaseUrl = 'http://127.0.0.1:3101/api/v1';

test('platform administrator can navigate the CMS workspace', async ({ page, request }) => {
  const suffix = randomUUID();
  const email = 'cms-admin-' + suffix + '@example.invalid';
  const password = 'CmsAdmin2026Secure';
  let userId: string | undefined;
  let disposableUserId: string | undefined;

  try {
    const registration = await request.post(apiBaseUrl + '/auth/register', {
      data: { email, password },
    });
    expect(registration.ok()).toBeTruthy();
    const registrationBody = (await registration.json()) as { developmentToken?: string };
    expect(registrationBody.developmentToken).toBeTruthy();

    const verification = await request.post(apiBaseUrl + '/auth/email-verifications', {
      data: { token: registrationBody.developmentToken },
    });
    expect(verification.ok()).toBeTruthy();

    const user = await database.user.update({
      where: { email },
      data: { platformRole: 'PLATFORM_ADMIN' },
    });
    userId = user.id;

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('navigation', { name: 'Navigasi administrasi' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Kelola kebutuhan penerbitan' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Jurnal & CMS/ })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
    ).toEqual([]);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByText('Menu administrasi').click();
    await expect(
      page.locator('.cms-mobile-menu').getByRole('navigation', { name: 'Navigasi administrasi' }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.getByRole('link', { name: /Jurnal & CMS/ }).click();
    await expect(page).toHaveURL(/\/admin\/journals$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Jurnal' })).toBeVisible();

    await page.getByRole('link', { name: /Pengguna/ }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Pengguna' })).toBeVisible();

    const disposableEmail = 'cms-disposable-' + suffix + '@example.invalid';
    const disposableUser = await database.user.create({
      data: { email: disposableEmail, passwordHash: 'browser-fixture-only' },
    });
    disposableUserId = disposableUser.id;
    await page.reload();
    const userAdministrationResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      userAdministrationResults.violations.filter(
        ({ impact }) => impact === 'critical' || impact === 'serious',
      ),
    ).toEqual([]);
    const disposableCard = page.locator('article').filter({ hasText: disposableEmail });
    await expect(disposableCard.getByRole('button', { name: 'Hapus akun' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(disposableCard.getByRole('button', { name: 'Hapus akun' })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });
    page.once('dialog', (dialog) => dialog.accept());
    await disposableCard.getByRole('button', { name: 'Hapus akun' }).click();
    await expect(page).toHaveURL(/deleted=1/);
    await expect(page.getByText('Akun pengguna berhasil dihapus.')).toBeVisible();
    expect(await database.user.findUnique({ where: { id: disposableUser.id } })).toBeNull();
    disposableUserId = undefined;

    await page.getByRole('link', { name: /Keamanan/ }).click();
    await expect(page).toHaveURL(/\/admin\/security$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Keamanan administrator' }),
    ).toBeVisible();
  } finally {
    if (disposableUserId) {
      await database.user.deleteMany({ where: { id: disposableUserId } });
    }
    if (userId) {
      await database.auditEvent.deleteMany({ where: { actorId: userId } });
      await database.user.delete({ where: { id: userId } });
    }
  }
});
