import { demoProject } from "@agentflow/demo-data";
import type { Db } from "./client";
import { projectItems, projects } from "./schema";

/**
 * Seeds the synthetic demo project into a workspace. Pure synthetic data: no
 * integrations, no local paths, no grants (B12).
 */
export async function seedDemoProject(
  db: Pick<Db, "insert">,
  workspaceId: string,
): Promise<string> {
  const [project] = await db
    .insert(projects)
    .values({
      workspaceId,
      name: demoProject.name,
      description: demoProject.description,
      isDemo: true,
    })
    .returning({ id: projects.id });
  const projectId = project!.id;
  let position = 0;
  const rows = demoProject.scenarios.flatMap((s) =>
    s.inputs.map((f) => ({
      projectId,
      workflow: s.kind,
      kind: f.kind,
      name: f.name,
      sizeLabel: f.sizeLabel,
      preview: f.preview,
      position: position++,
    })),
  );
  await db.insert(projectItems).values(rows);
  return projectId;
}
