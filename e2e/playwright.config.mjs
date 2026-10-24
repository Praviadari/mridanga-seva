// Playwright set-up for the E2E tests (e2e/README.md). Runs against app/dist (the TEST web export)
// served by scripts/serve-dist.mjs on 127.0.0.1, signed in with the E2E logins on the TEST project.
//
// Projects: "<browser>-sign-in" signs each role in through the screens (the sign-in flow) and keeps
// the session in .auth/<browser>-<role>.json; "<browser>" runs the other flows with those sessions.
// Chromium: Playwright's own build when installed, otherwise the installed Chrome (the office network
// blocks Playwright's Chromium download, so `channel: 'chrome'` is the fallback). WebKit: Safari's
// engine, for iPhones; skipped with E2E_BROWSERS=chromium.

import { existsSync } from 'node:fs';

import { chromium, defineConfig, devices } from '@playwright/test';

import { e2eLogins, testProject } from './scripts/lib/env.mjs';

// Stops before any browser opens unless the settings name the TEST project and the logins are there.
testProject();
const env = e2eLogins();
const port = Number(env.E2E_PORT ?? 8190);

const bundledChromium = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

const browsers = (process.env.E2E_BROWSERS ?? 'chromium,webkit').split(',').map((s) => s.trim());

const BROWSERS = {
  // A phone-sized window: the class uses the app on phones.
  chromium: { ...devices['Pixel 7'], ...(bundledChromium ? {} : { channel: 'chrome' }) },
  webkit: { ...devices['iPhone 15'] },
};

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.mjs/,
  // The flows share the TEST database and the E2E logins: one at a time keeps them independent.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
  },
  webServer: {
    command: `node scripts/serve-dist.mjs ${port}`,
    url: `http://127.0.0.1:${port}/version.txt`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: browsers
    .filter((b) => b in BROWSERS)
    .flatMap((b) => [
      { name: `${b}-sign-in`, testMatch: /sign-in\.spec\.mjs/, use: BROWSERS[b] },
      { name: b, testIgnore: /sign-in\.spec\.mjs/, dependencies: [`${b}-sign-in`], use: BROWSERS[b] },
    ]),
});
