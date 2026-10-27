import type { ProjectDetail, WorkspaceDetail, WorkspacesResponse } from "@agentflow/contracts";
import { and, asc, eq, schema, sql } from "@agentflow/db";
import { Hono } from "hono";
import { isUuid, workspaceRole } from "../authz";
import type { AppEnv, Deps } from "../context";
import { errorBody, requireUser } from "../middleware";

export function workspaceRoutes({ db }: Deps) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);
  const notFound = () => errorBody("not_found", "Not found");

  app.get("/", async (c) => {
    const { user } = c.get("auth")!;
    const rows = await db
      .select({
        id: schema.workspaces.id,
        name: schema.workspaces.name,
        role: schema.workspaceMembers.role,
      })
      .from(schema.workspaceMembers)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
      .where(eq(schema.workspaceMembers.userId, user.id))
      .orderBy(asc(schema.workspaces.createdAt));
    return c.json<WorkspacesResponse>({ workspaces: rows });
  });

  app.get("/:workspaceId", async (c) => {
    const { user } = c.get("auth")!;
    const workspaceId = c.req.param("workspaceId");
    const membership = await workspaceRole(db, user.id, workspaceId);
    if (!membership) return c.json(notFound(), 404);
    const projects = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        isDemo: schema.projects.isDemo,
        itemCount: sql<number>`count(${schema.projectItems.id})::int`,
      })
      .from(schema.projects)
      .leftJoin(schema.projectItems, eq(schema.projectItems.projectId, schema.projects.id))
      .where(eq(schema.projects.workspaceId, workspaceId))
      .groupBy(schema.projects.id)
      .orderBy(asc(schema.projects.createdAt));
    return c.json<WorkspaceDetail>({
      id: workspaceId,
      name: membership.name,
      role: membership.role,
      projects,
    });
  });

  app.get("/:workspaceId/projects/:projectId", async (c) => {
    const { user } = c.get("auth")!;
    const { workspaceId, projectId } = c.req.param();
    if (!(await workspaceRole(db, user.id, workspaceId)) || !isUuid(projectId))
      return c.json(notFound(), 404);
    // The project must belong to the authorized workspace, not just exist.
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.workspaceId, workspaceId)));
    if (!project) return c.json(notFound(), 404);
    const items = await db
      .select()
      .from(schema.projectItems)
      .where(eq(schema.projectItems.projectId, projectId))
      .orderBy(asc(schema.projectItems.position));
    return c.json<ProjectDetail>({
      id: project.id,
      workspaceId,
      name: project.name,
      description: project.description,
      isDemo: project.isDemo,
      items: items.map(({ id, workflow, kind, name, sizeLabel, preview }) => ({
        id,
        workflow,
        kind,
        name,
        sizeLabel,
        preview,
      })),
    });
  });

  return app;
}
