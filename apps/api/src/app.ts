import { API_VERSION, type ErrorResponse, type HealthResponse } from "@agentflow/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { InvalidTransitionError } from "@agentflow/workflow";
import { EngineError } from "./engine/errors";
import { runRoutes, workflowRoutes } from "./routes/engine";
import { authRoutes } from "./auth/routes";
import type { AppEnv, Deps } from "./context";
import { errorBody, loadAuth, noStore, requireSameOrigin } from "./middleware";
import { meRoutes } from "./routes/me";
import { workspaceRoutes } from "./routes/workspaces";

export const SERVICE_VERSION = "0.0.0";

/**
 * API surface: health, OAuth sign-in/out, account, workspace reads, and the
 * workflow engine (definitions, versions, runs, approvals) running the
 * deterministic mock executor. Billing (M13) and real execution are absent.
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
  app.use(
    "/v1/*",
    noStore,
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => c.json(errorBody("payload_too_large", "Request body too large"), 413),
    }),
    requireSameOrigin(deps),
    loadAuth(deps),
  );
  app.route("/", authRoutes(deps));
  app.route("/v1/me", meRoutes(deps));
  app.route("/v1/workspaces/:workspaceId/workflows", workflowRoutes(deps));
  app.route("/v1/workspaces/:workspaceId/runs", runRoutes(deps));
  app.route("/v1/workspaces", workspaceRoutes(deps));

  app.notFound((c) =>
    c.json<ErrorResponse>({ error: { code: "not_found", message: "Not found" } }, 404),
  );

  app.onError((err, c) => {
    if (err instanceof EngineError) {
      return c.json<ErrorResponse>(
        {
          error: {
            code: err.code,
            message: err.message,
            ...(err.details ? { details: err.details } : {}),
          },
        },
        err.status,
      );
    }
    if (err instanceof InvalidTransitionError) {
      return c.json<ErrorResponse>({ error: { code: err.code, message: err.message } }, 409);
    }
    // Never echo internal error details: they can contain connection strings or tokens.
    console.error(`api error: ${err.name}`);
    return c.json<ErrorResponse>({ error: { code: "internal", message: "Internal error" } }, 500);
  });

  return app;
}
