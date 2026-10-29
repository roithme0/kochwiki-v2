import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    browser: {
      screenshotFailures: true,
      screenshotDirectory: 'test-results/browser/screenshots',
      trace: {
        mode: 'retain-on-failure',
        tracesDir: 'test-results/browser/traces',
      },
    },
  },
});
