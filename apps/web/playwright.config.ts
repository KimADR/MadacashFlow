import { defineConfig, devices } from '@playwright/test';

const webPort = 3210;
const apiPort = 3211;
const baseURL = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node tests/mock-api.mjs',
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      reuseExistingServer: false,
      env: { API_TEST_PORT: String(apiPort) },
      timeout: 30_000,
    },
    {
      command: `pnpm exec next start -p ${webPort}`,
      url: baseURL,
      reuseExistingServer: false,
      env: {
        API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
        WEB_ORIGIN: baseURL,
      },
      timeout: 60_000,
    },
  ],
});
