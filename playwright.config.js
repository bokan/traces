const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3847',
    trace: 'on-first-retry',
    screenshot: 'on',
  },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3847',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
  outputDir: './screenshots',
});
