import "server-only";
import { MeResponse, ProvidersResponse } from "@agentflow/contracts";
import { cookies } from "next/headers";
import type { z } from "zod";

const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

export class ApiUnavailableError extends Error {
  constructor() {
    super("AgentFlow API is unreachable");
  }
}

export type ApiResult<T> = { status: 200; data: T } | { status: 401 | 403 | 404; data: null };

/**
 * Server-side GET against the API, forwarding only the browser's cookie header.
 * Responses are validated against the shared contracts.
 */
export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
): Promise<ApiResult<z.infer<S>>> {
  const cookieHeader = (await cookies()).toString();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: "no-store",
    });
  } catch {
    throw new ApiUnavailableError();
  }
  if (res.status === 401 || res.status === 403 || res.status === 404)
    return { status: res.status, data: null };
  if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
  return { status: 200, data: schema.parse(await res.json()) };
}

export async function getMe() {
  const r = await apiGet("/v1/me", MeResponse);
  return r.status === 200 ? r.data : null;
}

export async function getProviders() {
  try {
    return (await apiGet("/v1/auth/providers", ProvidersResponse)).data;
  } catch (e) {
    if (e instanceof ApiUnavailableError) return null;
    throw e;
  }
}
