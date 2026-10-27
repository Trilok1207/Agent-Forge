import { API_VERSION, type ErrorResponse, type HealthResponse } from "@agentflow/contracts";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { authRoutes } from "./auth/routes";
import type { AppEnv, Deps } from "./context";
import { loadAuth, noStore, requireSameOrigin } from "./middleware";
import { meRoutes } from "./routes/me";
import { workspaceRoutes } from "./routes/workspaces";

export const SERVICE_VERSION = "0.0.0";

/**
 * API surface (Session 2): health, OAuth sign-in/out, account, and
 * workspace-scoped reads. Billing (M13) and agent execution (M7) are absent.
 */
export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();
  app.use("*", secureHeaders());

  app.get("/health", (c) =>
    c.json<HealthResponse>({
      status: "ok",
      service: "agentflow-api",
      version: SERVICE_VERSION,
      apiVersion: API_VERSION,
    }),
  );

  app.use("/auth/*", noStore, loadAuth(deps));
  app.use("/v1/*", noStore, requireSameOrigin(deps), loadAuth(deps));
  app.route("/", authRoutes(deps));
  app.route("/v1/me", meRoutes(deps));
  app.route("/v1/workspaces", workspaceRoutes(deps));

  app.notFound((c) =>
    c.json<ErrorResponse>({ error: { code: "not_found", message: "Not found" } }, 404),
  );

  // Never echo internal error details: they can contain connection strings or tokens.
  app.onError((err, c) => {
    console.error(`api error: ${err.name}`);
    return c.json<ErrorResponse>({ error: { code: "internal", message: "Internal error" } }, 500);
  });

  return app;
}
