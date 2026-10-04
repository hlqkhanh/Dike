import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'corepack pnpm dev',
    cwd: '../..',
    env: {
      REQUIRE_PHONE_OTP: 'true',
      OTP_PROVIDER: 'fake',
      OTP_DEV_EXPOSE_CODE: 'true',
      AUTH_RATE_LIMIT_PREFIX: `auth:e2e:${process.pid}:${Date.now()}`,
    },
    url: 'http://localhost:3000/api/health',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
