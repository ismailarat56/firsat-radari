import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const installedChrome = [
  '/opt/google/chrome/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((p) => existsSync(p));
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4329',
    viewport: { width: 1440, height: 1000 },
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? installedChrome,
    },
  },
  webServer: {
    command: 'npm run build && FR_E2E=1 node --import tsx tests/e2e/server.ts',
    url: 'http://127.0.0.1:4329',
    reuseExistingServer: false,
    timeout: 45000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
