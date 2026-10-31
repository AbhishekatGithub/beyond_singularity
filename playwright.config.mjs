import { defineConfig } from '@playwright/test';

const androidUA = 'Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const iosUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

const project = (name, browserName, width, height, dpr, userAgent) => ({
  name,
  use: {
    browserName,
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true,
    userAgent,
    colorScheme: 'dark',
    locale: 'en-US'
  }
});

export default defineConfig({
  testDir: './tests/mobile',
  fullyParallel: true,
  forbidOnly: true,
  retries: 1,
  workers: process.env.CI ? 3 : 4,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'qa-artifacts/results.json' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    actionTimeout: 8_000,
    navigationTimeout: 10_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/app/src/main/assets/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  },
  outputDir: 'qa-artifacts/test-results',
  projects: [
    project('android-galaxy-s24', 'chromium', 832, 384, 2.8125, androidUA),
    project('android-compact-720p', 'chromium', 711, 320, 2.25, androidUA),
    project('android-pixel-8-pro', 'chromium', 896, 412, 2.625, androidUA),
    project('android-galaxy-a54', 'chromium', 800, 360, 2.625, androidUA),
    project('android-foldable-landscape', 'chromium', 1108, 884, 2.0, androidUA),
    project('android-tablet-landscape', 'chromium', 1280, 800, 2.0, androidUA),
    project('ios-iphone-se-landscape', 'webkit', 667, 375, 2.0, iosUA),
    project('ios-iphone-15-landscape', 'webkit', 852, 393, 3.0, iosUA),
    project('ios-iphone-15-pro-max-landscape', 'webkit', 932, 430, 3.0, iosUA),
    project('ios-ipad-mini-landscape', 'webkit', 1133, 744, 2.0, iosUA)
  ]
});
