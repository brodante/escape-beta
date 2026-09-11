import { defineConfig } from "drizzle-kit";

// Used for real Postgres deployments: `npx drizzle-kit push` creates the
// tables from src/db/schema.ts. Local play without DATABASE_URL uses the
// embedded PGlite database instead, which self-provisions (see src/db/index.ts).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
