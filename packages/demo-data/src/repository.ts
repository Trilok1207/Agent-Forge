import type { DemoScenario } from "./types";

export const repositoryScenario: DemoScenario = {
  kind: "repository",
  label: "Repository",
  tagline: "Analyze a repo and propose a diff — no commands, no pushes",
  inputs: [
    {
      name: "sample-todo-api/",
      kind: "source",
      sizeLabel: "14 files",
      preview: "Express + TypeScript TODO API (synthetic demo repo)",
    },
    {
      name: "src/routes/todos.ts",
      kind: "source",
      sizeLabel: "2 KB",
      preview:
        "router.get('/todos/:id', async (req, res) => {\n  const todo = await db.find(req.params.id);\n  res.json(todo);\n});",
    },
    {
      name: "README.md",
      kind: "source",
      sizeLabel: "1 KB",
      preview: "# sample-todo-api\nA tiny TODO service used for the AgentFlow demo.",
    },
  ],
  suggestedRequest:
    "Review this repo for bugs and propose a fix for the most important one as a diff.",
  plan: {
    schemaVersion: 1,
    id: "demo_plan_repository",
    kind: "repository",
    request: "Review this repo for bugs and propose a fix for the most important one as a diff.",
    summary:
      "Snapshot the selected repo (read-only), analyze it, propose a diff, and let you export it on approval. No commands are run.",
    steps: [
      {
        id: "snapshot",
        type: "local.repo_snapshot",
        title: "Read the selected repository",
        dependsOn: [],
        grantIds: ["demo_grant_repo"],
        requiresApproval: false,
      },
      {
        id: "analyze",
        type: "model.analyze_code",
        title: "Analyze code for issues",
        dependsOn: ["snapshot"],
        grantIds: [],
        requiresApproval: false,
      },
      {
        id: "propose",
        type: "model.propose_diff",
        title: "Propose a fix as a diff",
        dependsOn: ["analyze"],
        grantIds: [],
        requiresApproval: false,
      },
      {
        id: "preview",
        type: "review.preview",
        title: "Show the diff for review",
        dependsOn: ["propose"],
        grantIds: [],
        requiresApproval: false,
      },
      {
        id: "export",
        type: "local.export_patch",
        title: "Export .patch to a location you choose",
        dependsOn: ["preview"],
        grantIds: [],
        requiresApproval: true,
      },
    ],
  },
  result: {
    type: "repository",
    findings: [
      {
        severity: "high",
        title: "Missing 404 for unknown TODO ids",
        detail: "GET /todos/:id returns 200 with a null body when the id does not exist.",
      },
      {
        severity: "medium",
        title: "No input validation on POST /todos",
        detail: "The title field is not checked for presence or length.",
      },
      {
        severity: "low",
        title: "README lacks setup steps",
        detail: "New contributors can't tell how to run the service.",
      },
    ],
    diff: `diff --git a/src/routes/todos.ts b/src/routes/todos.ts
--- a/src/routes/todos.ts
+++ b/src/routes/todos.ts
@@ -1,4 +1,7 @@
 router.get('/todos/:id', async (req, res) => {
   const todo = await db.find(req.params.id);
+  if (!todo) {
+    return res.status(404).json({ error: 'Todo not found' });
+  }
   res.json(todo);
 });`,
    saveAs: "fix-todo-404.patch",
  },
};
