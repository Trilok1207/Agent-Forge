import type { AuditResponse, MeResponse, SessionsResponse } from "@agentflow/contracts";
import { and, desc, eq, schema } from "@agentflow/db";
import { Hono } from "hono";
import { audit } from "../audit";
import { clearSessionCookie } from "../auth/session";
import { isUuid } from "../authz";
import type { AppEnv, Deps } from "../context";
import { errorBody, requireUser } from "../middleware";

export function meRoutes(deps: Deps) {
  const { db, config } = deps;
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);

  app.get("/", async (c) => {
    const { user } = c.get("auth")!;
    const [accounts, memberships] = await Promise.all([
      db
        .select({ provider: schema.oauthAccounts.provider })
        .from(schema.oauthAccounts)
        .where(eq(schema.oauthAccounts.userId, user.id)),
      db
        .select({
          id: schema.workspaces.id,
          name: schema.workspaces.name,
          role: schema.workspaceMembers.role,
        })
        .from(schema.workspaceMembers)
        .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
        .where(eq(schema.workspaceMembers.userId, user.id))
        .orderBy(schema.workspaces.createdAt),
    ]);
    return c.json<MeResponse>({
      user,
      linkedProviders: accounts.map((a) => a.provider).sort(),
      workspaces: memberships,
    });
  });

  app.get("/sessions", async (c) => {
    const { user, sessionId } = c.get("auth")!;
    const rows = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, user.id))
      .orderBy(desc(schema.sessions.createdAt));
    return c.json<SessionsResponse>({
      sessions: rows.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        userAgent: s.userAgent,
        current: s.id === sessionId,
      })),
    });
  });

  app.delete("/sessions/:id", async (c) => {
    const { user, sessionId } = c.get("auth")!;
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json(errorBody("not_found", "Not found"), 404);
    // Ownership is part of the WHERE clause: another user's session id simply matches nothing.
    const deleted = await db
      .delete(schema.sessions)
      .where(and(eq(schema.sessions.id, id), eq(schema.sessions.userId, user.id)))
      .returning({ id: schema.sessions.id });
    if (deleted.length === 0) return c.json(errorBody("not_found", "Not found"), 404);
    await audit(db, {
      actorUserId: user.id,
      action: "session.revoked",
      detail: { current: id === sessionId },
    });
    if (id === sessionId) clearSessionCookie(c, config);
    return c.body(null, 204);
  });

  app.get("/audit", async (c) => {
    const { user } = c.get("auth")!;
    const rows = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.actorUserId, user.id))
      .orderBy(desc(schema.auditEvents.at))
      .limit(50);
    return c.json<AuditResponse>({
      events: rows.map((e) => ({
        id: e.id,
        at: e.at.toISOString(),
        action: e.action,
        detail: e.detail,
      })),
    });
  });

  return app;
}
