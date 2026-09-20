import "dotenv/config";

import { defineConfig } from "drizzle-kit";

import { resolveNeonMigrationUrl } from "./src/db/connection-url";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: resolveNeonMigrationUrl(process.env),
  },
  strict: true,
  verbose: true,
});
