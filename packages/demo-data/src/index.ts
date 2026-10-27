import { documentsScenario } from "./documents";
import { emailScenario } from "./email";
import { repositoryScenario } from "./repository";
import type { DemoScenario } from "./types";

export * from "./types";
export { documentsScenario, emailScenario, repositoryScenario };

/** Bundled synthetic demo project. No real data, no grants, no network (B12). */
export const demoProject = {
  name: "Demo project",
  description:
    "Synthetic files, emails, and a sample repo. Nothing here is real and nothing is written.",
  scenarios: [
    documentsScenario,
    emailScenario,
    repositoryScenario,
  ] as const satisfies readonly DemoScenario[],
};
