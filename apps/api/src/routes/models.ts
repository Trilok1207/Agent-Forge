import {
  AcceptPlanRequest,
  PutModelKeyRequest,
  type ModelKeyInfo,
  type ModelStatusResponse,
  type PlanDraftInfo,
} from "@agentflow/contracts";
import { and, asc, eq, schema } from "@agentflow/db";
import { Secret } from "@agentflow/models";
import type { Context } from "hono";
import { audit } from "../audit";
import type { Deps } from "../context";
import { EngineError, notFound } from "../engine/errors";
import { acceptPlan, createPlan, discardPlan, getPlan, listPlans } from "../models/plans";
import { credentialAad } from "../models/setup";
import { jsonBody, scoped } from "./engine";

function sendPlan(
  c: Context,
  r: { plan: PlanDraftInfo; replayed: boolean },
  createdStatus: 200 | 201 = 200,
) {
  if (r.replayed) c.header("Idempotent-Replayed", "true");
  return c.json<PlanDraftInfo>(r.plan, r.replayed ? 200 : createdStatus);
}

/** Mounted at /v1/workspaces/:workspaceId/plans */
export function planRoutes(deps: Deps) {
  const app = scoped(deps);
  const user = (c: Context) => (c.get("auth") as { user: { id: string } }).user.id;

  app.get("/", async (c) => c.json({ plans: await listPlans(deps.db, c.get("workspaceId")) }));

  app.post("/", async (c) =>
    sendPlan(
      c,
      await createPlan(deps.db, deps.models, {
        workspaceId: c.get("workspaceId"),
        userId: user(c),
        idempotencyKey: c.req.header("idempotency-key"),
        body: await jsonBody(c),
      }),
      201,
    ),
  );

  app.get("/:planId", async (c) =>
    c.json<PlanDraftInfo>(await getPlan(deps.db, c.get("workspaceId"), c.req.param("planId"))),
  );

  app.post("/:planId/accept", async (c) => {
    const parsed = AcceptPlanRequest.safeParse(await jsonBody(c));
    if (!parsed.success)
      throw new EngineError(422, "invalid_request", "specHash is required", [
        "specHash: sha256 hex",
      ]);
    return sendPlan(
      c,
      await acceptPlan(deps.db, {
        workspaceId: c.get("workspaceId"),
        userId: user(c),
        id: c.req.param("planId"),
        specHash: parsed.data.specHash,
      }),
    );
  });

  app.post("/:planId/discard", async (c) =>
    sendPlan(
      c,
      await discardPlan(deps.db, {
        workspaceId: c.get("workspaceId"),
        userId: user(c),
        id: c.req.param("planId"),
      }),
    ),
  );

  return app;
}

/** Mounted at /v1/workspaces/:workspaceId/models — status and BYOK keys. Key values are write-only. */
export function modelRoutes(deps: Deps) {
  const app = scoped(deps);
  const { models, db } = deps;

  const keyList = async (workspaceId: string): Promise<ModelKeyInfo[]> =>
    (
      await db
        .select({
          provider: schema.modelCredentials.provider,
          last4: schema.modelCredentials.last4,
          createdAt: schema.modelCredentials.createdAt,
        })
        .from(schema.modelCredentials)
        .where(eq(schema.modelCredentials.workspaceId, workspaceId))
        .orderBy(asc(schema.modelCredentials.provider))
    ).map((k) => ({ ...k, createdAt: k.createdAt.toISOString() }));

  app.get("/", async (c) =>
    c.json<ModelStatusResponse>({
      defaultProvider: models.defaultProvider,
      providers: Object.values(models.providers).map((p) => ({
        id: p.id,
        hosted: p.supportsHosted,
        byok: p.supportsByok,
      })),
      byokAvailable: models.vault !== null,
      keys: await keyList(c.get("workspaceId")),
    }),
  );

  app.put("/keys/:provider", async (c) => {
    const workspaceId = c.get("workspaceId");
    const providerId = c.req.param("provider");
    const provider = models.providers[providerId];
    if (!provider || !provider.supportsByok)
      throw new EngineError(404, "provider_not_found", "Unknown provider or BYOK not supported");
    if (!models.vault)
      throw new EngineError(503, "byok_not_configured", "BYOK is not configured on this server");
    const parsed = PutModelKeyRequest.safeParse(await jsonBody(c));
    // Never echo validation details here: they could include the key.
    if (!parsed.success)
      throw new EngineError(422, "invalid_request", "apiKey must be 8-512 characters");
    const key = new Secret(parsed.data.apiKey.trim());
    const enc = models.vault.encrypt(key, credentialAad(workspaceId, providerId));
    const userId = (c.get("auth") as { user: { id: string } }).user.id;
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.modelCredentials)
        .where(
          and(
            eq(schema.modelCredentials.workspaceId, workspaceId),
            eq(schema.modelCredentials.provider, providerId),
          ),
        );
      await tx.insert(schema.modelCredentials).values({
        workspaceId,
        provider: providerId,
        ...enc,
        last4: key.reveal().slice(-4),
        createdBy: userId,
      });
      await audit(tx, {
        actorUserId: userId,
        workspaceId,
        action: "model_key.saved",
        detail: { provider: providerId },
      });
    });
    const info = (await keyList(workspaceId)).find((k) => k.provider === providerId)!;
    return c.json<ModelKeyInfo>(info, 200);
  });

  app.delete("/keys/:provider", async (c) => {
    const workspaceId = c.get("workspaceId");
    const providerId = c.req.param("provider");
    const removed = await db
      .delete(schema.modelCredentials)
      .where(
        and(
          eq(schema.modelCredentials.workspaceId, workspaceId),
          eq(schema.modelCredentials.provider, providerId),
        ),
      )
      .returning({ id: schema.modelCredentials.id });
    if (!removed.length) throw notFound();
    await audit(db, {
      actorUserId: (c.get("auth") as { user: { id: string } }).user.id,
      workspaceId,
      action: "model_key.deleted",
      detail: { provider: providerId },
    });
    return c.body(null, 204);
  });

  return app;
}
