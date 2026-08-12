import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // Uses the system-installed Edge/Chrome instead of Playwright's own
      // bundled browser download — avoids a large, environment-dependent
      // download step just to run the test suite.
      use: { ...devices['Desktop Chrome'], channel: 'msedge' },
    },
  ],
});
