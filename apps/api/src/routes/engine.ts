import {
  CreateVersionRequest,
  CreateWorkflowRequest,
  type RunInfo,
  type WorkflowDetail,
} from "@agentflow/contracts";
import { Hono, type Context } from "hono";
import { workspaceRole } from "../authz";
import type { AppEnv, Deps } from "../context";
import { EngineError } from "../engine/errors";
import { cancelRun, createRun, decideApproval, listRuns, loadRunInfo } from "../engine/runs";
import {
  createVersion,
  createWorkflow,
  getWorkflowDetail,
  listWorkflows,
} from "../engine/workflows";
import { errorBody, requireUser } from "../middleware";

type Env = AppEnv & { Variables: { workspaceId: string } };

/** Session + workspace membership for every engine route (B11). Non-members get 404. */
function scoped(deps: Deps) {
  const app = new Hono<Env>();
  app.use("*", requireUser, async (c, next) => {
    const workspaceId = c.req.param("workspaceId") ?? "";
    if (!(await workspaceRole(deps.db, c.get("auth")!.user.id, workspaceId))) {
      return c.json(errorBody("not_found", "Not found"), 404);
    }
    c.set("workspaceId", workspaceId);
    await next();
  });
  return app;
}

async function jsonBody(c: Context) {
  try {
    return await c.req.json();
  } catch {
    throw new EngineError(400, "invalid_json", "Request body must be JSON");
  }
}

function sendRun(
  c: Context,
  result: { run: RunInfo; replayed: boolean },
  createdStatus: 200 | 201 = 200,
) {
  if (result.replayed) c.header("Idempotent-Replayed", "true");
  return c.json<RunInfo>(result.run, result.replayed ? 200 : createdStatus);
}

/** Mounted at /v1/workspaces/:workspaceId/workflows */
export function workflowRoutes(deps: Deps) {
  const app = scoped(deps);

  app.get("/", async (c) =>
    c.json({ workflows: await listWorkflows(deps.db, c.get("workspaceId")) }),
  );

  app.post("/", async (c) => {
    const parsed = CreateWorkflowRequest.safeParse(await jsonBody(c));
    if (!parsed.success) {
      throw new EngineError(
        422,
        "invalid_request",
        "Invalid workflow",
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      );
    }
    const id = await createWorkflow(deps.db, {
      workspaceId: c.get("workspaceId"),
      userId: c.get("auth")!.user.id,
      ...parsed.data,
    });
    return c.json<WorkflowDetail>(await getWorkflowDetail(deps.db, c.get("workspaceId"), id), 201);
  });

  app.get("/:workflowId", async (c) =>
    c.json<WorkflowDetail>(
      await getWorkflowDetail(deps.db, c.get("workspaceId"), uuidParam(c, "workflowId")),
    ),
  );

  app.post("/:workflowId/versions", async (c) => {
    const parsed = CreateVersionRequest.safeParse(await jsonBody(c));
    if (!parsed.success)
      throw new EngineError(422, "invalid_request", "Invalid version", ["spec: required"]);
    const result = await createVersion(deps.db, {
      workspaceId: c.get("workspaceId"),
      userId: c.get("auth")!.user.id,
      definitionId: uuidParam(c, "workflowId"),
      spec: parsed.data.spec,
    });
    if (!result.created) c.header("Idempotent-Replayed", "true");
    return c.json(result.version, result.created ? 201 : 200);
  });

  return app;
}

/** Mounted at /v1/workspaces/:workspaceId/runs */
export function runRoutes(deps: Deps) {
  const app = scoped(deps);
  const engine = { db: deps.db, quota: deps.quota, executor: deps.executor };

  app.get("/", async (c) => c.json({ runs: await listRuns(deps.db, c.get("workspaceId")) }));

  app.post("/", async (c) =>
    sendRun(
      c,
      await createRun(engine, {
        workspaceId: c.get("workspaceId"),
        userId: c.get("auth")!.user.id,
        idempotencyKey: c.req.header("idempotency-key"),
        body: await jsonBody(c),
      }),
      201,
    ),
  );

  app.get("/:runId", async (c) =>
    c.json<RunInfo>(await loadRunInfo(deps.db, c.get("workspaceId"), c.req.param("runId"))),
  );

  app.post("/:runId/approvals/:approvalId", async (c) =>
    sendRun(
      c,
      await decideApproval(engine, {
        workspaceId: c.get("workspaceId"),
        userId: c.get("auth")!.user.id,
        runId: c.req.param("runId"),
        approvalId: c.req.param("approvalId"),
        body: await jsonBody(c),
      }),
    ),
  );

  app.post("/:runId/cancel", async (c) =>
    sendRun(
      c,
      await cancelRun(engine, {
        workspaceId: c.get("workspaceId"),
        userId: c.get("auth")!.user.id,
        runId: c.req.param("runId"),
      }),
    ),
  );

  return app;
}

function uuidParam(c: Context, name: string) {
  const v = c.req.param(name) ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))
    throw new EngineError(404, "not_found", "Not found");
  return v;
}
