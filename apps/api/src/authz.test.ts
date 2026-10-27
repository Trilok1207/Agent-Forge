import {
  ErrorResponse,
  MeResponse,
  ProjectDetail,
  SessionsResponse,
  WorkspaceDetail,
  WorkspacesResponse,
} from "@agentflow/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { get, ORIGIN, setup, signIn, type Harness } from "./test/harness";

/**
 * B11: users can reach only their own workspaces, projects, sessions, and audit
 * records. Foreign or unknown ids both return 404 so ids can't be probed.
 */
let h: Harness;
let alice: { cookie: string; workspaceId: string; projectId: string };
let bob: { cookie: string; workspaceId: string; projectId: string };

async function makeUser(name: string) {
  const r = await signIn(h, h.google, {
    providerUserId: `g-${name}`,
    email: `${name}@example.com`,
    name,
  });
  const me = MeResponse.parse(await (await get(h, "/v1/me", r.cookie)).json());
  const workspaceId = me.workspaces[0]!.id;
  const ws = WorkspaceDetail.parse(
    await (await get(h, `/v1/workspaces/${workspaceId}`, r.cookie)).json(),
  );
  return { cookie: r.cookie!, workspaceId, projectId: ws.projects[0]!.id };
}

beforeAll(async () => {
  h = await setup();
  alice = await makeUser("alice");
  bob = await makeUser("bob");
});
afterAll(() => h.handle.close());

describe("authorization", () => {
  it.each(["/v1/me", "/v1/me/sessions", "/v1/me/audit", "/v1/workspaces"])(
    "%s requires a session",
    async (path) => {
      const res = await get(h, path);
      expect(res.status).toBe(401);
      expect(ErrorResponse.parse(await res.json()).error.code).toBe("unauthenticated");
    },
  );

  it("workspace and project reads require a session", async () => {
    expect((await get(h, `/v1/workspaces/${alice.workspaceId}`)).status).toBe(401);
    expect(
      (await get(h, `/v1/workspaces/${alice.workspaceId}/projects/${alice.projectId}`)).status,
    ).toBe(401);
  });

  it("owners can read their own workspace and demo project", async () => {
    const res = await get(
      h,
      `/v1/workspaces/${alice.workspaceId}/projects/${alice.projectId}`,
      alice.cookie,
    );
    expect(res.status).toBe(200);
    const project = ProjectDetail.parse(await res.json());
    expect(project.isDemo).toBe(true);
    expect(project.items).toHaveLength(9);
  });

  it("lists only the caller's workspaces", async () => {
    const list = WorkspacesResponse.parse(
      await (await get(h, "/v1/workspaces", alice.cookie)).json(),
    );
    expect(list.workspaces.map((w) => w.id)).toEqual([alice.workspaceId]);
  });

  it("another user's workspace is 404", async () => {
    const res = await get(h, `/v1/workspaces/${alice.workspaceId}`, bob.cookie);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("alice");
  });

  it("another user's project is 404, directly or via the caller's own workspace id", async () => {
    expect(
      (await get(h, `/v1/workspaces/${alice.workspaceId}/projects/${alice.projectId}`, bob.cookie))
        .status,
    ).toBe(404);
    // Mixing an authorized workspace with a foreign project id must not leak it.
    expect(
      (await get(h, `/v1/workspaces/${bob.workspaceId}/projects/${alice.projectId}`, bob.cookie))
        .status,
    ).toBe(404);
  });

  it("unknown and malformed ids are 404, not 500", async () => {
    for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid", "1;drop table users"]) {
      expect((await get(h, `/v1/workspaces/${encodeURIComponent(id)}`, alice.cookie)).status).toBe(
        404,
      );
      expect(
        (
          await get(
            h,
            `/v1/workspaces/${alice.workspaceId}/projects/${encodeURIComponent(id)}`,
            alice.cookie,
          )
        ).status,
      ).toBe(404);
    }
  });

  it("cannot revoke another user's session", async () => {
    const bobSessions = SessionsResponse.parse(
      await (await get(h, "/v1/me/sessions", bob.cookie)).json(),
    );
    const target = bobSessions.sessions[0]!.id;
    const res = await h.app.request(`/v1/me/sessions/${target}`, {
      method: "DELETE",
      headers: { cookie: alice.cookie, origin: ORIGIN },
    });
    expect(res.status).toBe(404);
    expect((await get(h, "/v1/me", bob.cookie)).status).toBe(200);
  });

  it("session listing and audit log never include other users' records", async () => {
    const sessions = SessionsResponse.parse(
      await (await get(h, "/v1/me/sessions", alice.cookie)).json(),
    );
    const bobIds = SessionsResponse.parse(
      await (await get(h, "/v1/me/sessions", bob.cookie)).json(),
    ).sessions.map((s) => s.id);
    expect(sessions.sessions.some((s) => bobIds.includes(s.id))).toBe(false);
    const audit = await (await get(h, "/v1/me/audit", alice.cookie)).json();
    expect(JSON.stringify(audit)).not.toContain(bob.workspaceId);
  });

  it("state-changing requests from other origins are blocked even with a valid session", async () => {
    const sessions = SessionsResponse.parse(
      await (await get(h, "/v1/me/sessions", alice.cookie)).json(),
    );
    const res = await h.app.request(`/v1/me/sessions/${sessions.sessions[0]!.id}`, {
      method: "DELETE",
      headers: { cookie: alice.cookie, origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
    expect((await get(h, "/v1/me", alice.cookie)).status).toBe(200);
  });
});
