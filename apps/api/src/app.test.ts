import { ErrorResponse, HealthResponse } from "@agentflow/contracts";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("api", () => {
  const app = createApp();

  it("GET /health matches the HealthResponse contract", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(HealthResponse.parse(await res.json()).status).toBe("ok");
  });

  it("sets security headers", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("returns a contract-shaped 404", async () => {
    const res = await app.request("/v1/runs");
    expect(res.status).toBe(404);
    expect(ErrorResponse.parse(await res.json()).error.code).toBe("not_found");
  });
});
