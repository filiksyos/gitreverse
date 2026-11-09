import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "build-project.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3185",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev --webpack --port 3185 --hostname localhost",
    url: "http://localhost:3185",
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_GITREVERSE_BUILD_ENABLED: "true",
      NEXT_PUBLIC_SKIP_AUTH: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://build-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-browser-test-key",
      // Browser mocks intercept APIs. The real server remains disabled.
      GITREVERSE_BUILD_ENABLED: "false",
    },
  },
});
