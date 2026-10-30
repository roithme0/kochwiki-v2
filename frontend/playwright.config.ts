import { defineConfig, devices } from '@playwright/test';
import { authenticatedStatePath } from './e2e/auth/support/auth-state';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] || 'http://localhost:9002',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop-chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: authenticatedStatePath,
      },
    },
    {
      name: 'mobile-chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 7'],
        storageState: authenticatedStatePath,
      },
    },
  ],
});
