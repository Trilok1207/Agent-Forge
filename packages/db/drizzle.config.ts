import { defineConfig } from "drizzle-kit";

// Generates SQL migrations from src/schema.ts. No database connection needed.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
