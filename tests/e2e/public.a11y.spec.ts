import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const path of ['/', '/journals', '/search', '/login']) {
  test(`${path} has no automatically detectable serious accessibility violations`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
    ).toEqual([]);
  });
}
