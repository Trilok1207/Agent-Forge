import { API_VERSION, type ErrorResponse, type HealthResponse } from "@agentflow/contracts";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

export const SERVICE_VERSION = "0.0.0";

/**
 * Session 1 skeleton: health only. Auth (M4), runs (M7), model gateway (M5),
 * and billing (M13) are intentionally absent.
 */
export function createApp() {
  const app = new Hono();
  app.use("*", secureHeaders());

  app.get("/health", (c) =>
    c.json<HealthResponse>({
      status: "ok",
      service: "agentflow-api",
      version: SERVICE_VERSION,
      apiVersion: API_VERSION,
    }),
  );

  app.notFound((c) =>
    c.json<ErrorResponse>({ error: { code: "not_found", message: "Not found" } }, 404),
  );

  // Never echo internal error details (they could contain secrets in later milestones).
  app.onError((_err, c) =>
    c.json<ErrorResponse>({ error: { code: "internal", message: "Internal error" } }, 500),
  );

  return app;
}
