import { defineConfig, devices } from '@playwright/test';

const webBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  outputDir: 'test-results/playwright',
  use: {
    baseURL: webBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  expect: {
    toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.01 },
  },
  projects: [
    {
      name: 'e2e',
      testMatch: /(?:public|admin|submission|editorial|review|production)\.e2e\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'a11y',
      testMatch: /public\.a11y\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testMatch: /public\.visual\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], colorScheme: 'light' },
    },
  ],
  webServer: [
    {
      command:
        'pnpm --filter @aksara/api exec dotenv -e ../../.env -- cross-env PORT=3101 APP_BASE_URL=http://localhost:3100 EMAIL_DELIVERY_MODE=development-token nest start --watch',
      url: 'http://127.0.0.1:3101/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        'pnpm --filter @aksara/web exec dotenv -e ../../.env -- cross-env APP_BASE_URL=http://localhost:3100 API_BASE_URL=http://127.0.0.1:3101/api/v1 next dev -p 3100',
      url: webBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
