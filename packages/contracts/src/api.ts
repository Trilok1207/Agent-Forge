import { z } from "zod";

export const API_VERSION = "v1";

export const HealthResponse = z.object({
  status: z.literal("ok"),
  service: z.literal("agentflow-api"),
  version: z.string(),
  apiVersion: z.literal(API_VERSION),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const ErrorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
