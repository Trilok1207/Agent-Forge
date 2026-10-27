import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against production builds (`pnpm build` first).
 * - Public suite: always runs; embedded PGlite; NO OAuth credentials (proves the demo works without them).
 * - Signed-in suite: needs E2E_DATABASE_URL (Postgres) so the test fixture can create sessions directly.
 *   The app itself has no test login path.
 * The web build's /api rewrite targets API_BASE_URL at build time (default http://127.0.0.1:8787).
 */
const WEB_PORT = 3200;
const ORIGIN = `http://localhost:${WEB_PORT}`;
const dbEnv: Record<string, string> = process.env.E2E_DATABASE_URL
  ? { DATABASE_URL: process.env.E2E_DATABASE_URL }
  : { PGLITE_DIR: ".e2e-pglite" };

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: ORIGIN, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /public\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "node ../api/dist/server.js",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: false,
      // Explicitly blank OAuth variables: e2e must never depend on real credentials.
      env: {
        NODE_ENV: "test",
        APP_ORIGIN: ORIGIN,
        API_PORT: "8787",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
        GITHUB_CLIENT_ID: "",
        GITHUB_CLIENT_SECRET: "",
        ...dbEnv,
      },
    },
    {
      command: `pnpm exec next start --port ${WEB_PORT}`,
      url: ORIGIN,
      reuseExistingServer: false,
    },
  ],
});
