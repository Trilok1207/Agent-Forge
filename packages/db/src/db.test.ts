import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "./client";
import { projectItems, projects, users, workspaces } from "./schema";
import { seedDemoProject } from "./seed";

let h: DbHandle;
beforeAll(async () => {
  h = createDb();
  await h.migrate();
});
afterAll(() => h.close());

describe("db", () => {
  it("applies migrations and seeds a synthetic demo project", async () => {
    const [u] = await h.db.insert(users).values({ email: "a@example.com" }).returning();
    const [w] = await h.db.insert(workspaces).values({ name: "A", ownerUserId: u!.id }).returning();
    const projectId = await seedDemoProject(h.db, w!.id);

    const [p] = await h.db.select().from(projects).where(eq(projects.id, projectId));
    expect(p!.isDemo).toBe(true);
    const items = await h.db
      .select()
      .from(projectItems)
      .where(eq(projectItems.projectId, projectId));
    expect(items.map((i) => i.workflow).sort()).toEqual([
      "documents",
      "documents",
      "documents",
      "email",
      "email",
      "email",
      "repository",
      "repository",
      "repository",
    ]);
  });

  it("enforces unique emails", async () => {
    await expect(h.db.insert(users).values({ email: "a@example.com" })).rejects.toThrow();
  });
});
