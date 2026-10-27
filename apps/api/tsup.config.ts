import { cpSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  // Workspace packages ship TypeScript source, so bundle them into the output.
  noExternal: [/^@agentflow\//],
  // Ship SQL migrations next to the bundle (server.ts looks for ./drizzle).
  onSuccess: async () => {
    cpSync("../../packages/db/drizzle", "dist/drizzle", { recursive: true });
  },
});
