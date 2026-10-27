import type { ErrorResponse } from "@agentflow/contracts";
import { createMiddleware } from "hono/factory";
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
  validateSessionToken,
} from "./auth/session";
import type { AppEnv, Deps } from "./context";

export const errorBody = (code: string, message: string): ErrorResponse => ({
  error: { code, message },
});

/** Resolves the session cookie (if any) into `c.var.auth`. */
export const loadAuth = ({ db, config }: Deps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("auth", null);
    const token = readSessionToken(c, config);
    if (token) {
      const result = await validateSessionToken(db, token);
      if (result) {
        c.set("auth", result.auth);
        if (result.renewedUntil) setSessionCookie(c, config, token, result.renewedUntil);
      } else {
        clearSessionCookie(c, config);
      }
    }
    await next();
  });

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("auth")) return c.json(errorBody("unauthenticated", "Sign in required"), 401);
  await next();
});

/**
 * CSRF defence for state-changing requests: the Origin header must be our app
 * origin. Applies to every unsafe method regardless of content type.
 */
export const requireSameOrigin = ({ config }: Deps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      if (c.req.header("origin") !== config.appOrigin)
        return c.json(errorBody("csrf", "Cross-origin request blocked"), 403);
    }
    await next();
  });

/** Authenticated and auth-flow responses must never be cached. */
export const noStore = createMiddleware(async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});
