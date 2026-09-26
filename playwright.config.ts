/// <reference types="node" />
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './ui-tests',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  outputDir: 'artifacts/ui-test-results',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    channel: process.platform === 'win32' ? 'msedge' : undefined,
  },
  webServer: {
    command: 'node scripts/preview.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
});
