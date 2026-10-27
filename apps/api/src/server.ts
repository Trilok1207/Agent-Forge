import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb } from "@agentflow/db";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createProviders } from "./auth/providers";
import { loadConfig } from "./config";
import { backfillDemoWorkflows } from "./engine/workflows";
import { ledgerQuota } from "./quota";
import { createMockExecutor } from "@agentflow/workflow";

// Local development reads apps/api/.env (names in .env.example). Production uses real environment variables.
if (process.env.NODE_ENV !== "production" && existsSync(".env")) process.loadEnvFile(".env");

const config = loadConfig();
if (config.pgliteDir) mkdirSync(config.pgliteDir, { recursive: true });
const handle = createDb({
  url: config.databaseUrl?.reveal(),
  pgliteDir: config.pgliteDir ?? undefined,
});

// The production bundle ships its migrations next to server.js; source runs use packages/db/drizzle.
const bundled = fileURLToPath(new URL("./drizzle", import.meta.url));
await handle.migrate(existsSync(bundled) ? bundled : undefined);

await backfillDemoWorkflows(handle.db);

const providers = createProviders(config);
const app = createApp({
  db: handle.db,
  config,
  providers,
  quota: ledgerQuota({ monthlyRunLimit: config.runQuotaPerMonth }),
  // Session 3: deterministic mock execution only. No models, files, or network.
  executor: createMockExecutor(),
});

serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" }, (info) => {
  const enabled = Object.keys(providers).filter((k) => providers[k as keyof typeof providers]);
  console.log(`agentflow-api listening on http://127.0.0.1:${info.port}`);
  console.log(`  database: ${handle.kind}${config.pgliteDir ? ` (${config.pgliteDir})` : ""}`);
  console.log(
    `  oauth providers: ${enabled.length ? enabled.join(", ") : "none configured (sign-in disabled)"}`,
  );
});
