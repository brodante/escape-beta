import { mkdirSync } from "node:fs";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Database connection with a zero-setup local fallback.
//
// - Production / shared envs: set DATABASE_URL and we use a regular Postgres
//   server via node-postgres (connection pool). Run `npx drizzle-kit push`
//   once to create the tables (see drizzle.config.ts).
// - Local play with no DATABASE_URL: we fall back to PGlite, a real Postgres
//   engine running embedded in this process, persisted to ./.pglite/app_db.
//   Tables are auto-created on boot, so `npm run dev` just works with no
//   external services (same philosophy as the in-memory pub/sub fallback in
//   src/server/engine/pubsub.ts when REDIS_URL is unset).
// ---------------------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __escapePgliteClient?: PGlite;
};

type NodePgDb = ReturnType<typeof drizzleNodePg>;

// Mirrors src/db/schema.ts. Only used for the embedded PGlite fallback, which
// auto-provisions its own tables on boot. Real Postgres deployments should use
// `npx drizzle-kit push` instead so the schema stays generated from the source
// of truth in schema.ts.
const PGLITE_SCHEMA_SQL = `
-- NOTE: no CREATE EXTENSION needed. PGlite bundles a modern Postgres where
-- gen_random_uuid() is built in (core since PG13).
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  scenario_id text NOT NULL,
  level_index integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'lobby',
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  host_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  is_host boolean NOT NULL DEFAULT false,
  connected boolean NOT NULL DEFAULT false,
  score integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted boolean NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

function createNodePgDb(url: string): { db: NodePgDb; pool: Pool; ready: Promise<void> } {
  const pool =
    globalForDb.__arenaNextJsPostgresqlPool ?? new Pool({ connectionString: url });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = pool;
  }

  return { db: drizzleNodePg(pool), pool, ready: Promise.resolve() };
}

function createPgliteDb(): { db: NodePgDb; pool: null; ready: Promise<void> } {
  const dataDir = process.env.PGLITE_DIR ?? "./.pglite/app_db";
  // PGlite does not create nested data directories itself, so ensure the path
  // exists before it tries to initialize the data files inside it.
  mkdirSync(dataDir, { recursive: true });
  const client = globalForDb.__escapePgliteClient ?? new PGlite(dataDir);

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__escapePgliteClient = client;
  }

  // The PGlite drizzle instance exposes the same query API our code uses
  // (select/insert/update/execute), so we type it as the node-postgres
  // variant to keep a single `db` type across both transports.
  const db = drizzlePglite(client) as unknown as NodePgDb;
  const ready = (async () => {
    await client.waitReady;
    await client.exec(PGLITE_SCHEMA_SQL);
  })();
  ready
    .then(() => console.log(`[db] using embedded PGlite database (${dataDir})`))
    .catch((err) => console.error("[db] failed to provision embedded database", err));

  return { db, pool: null, ready };
}

const created = databaseUrl ? createNodePgDb(databaseUrl) : createPgliteDb();

export const db = created.db;
export const pool = created.pool;

/** Resolves once the underlying database is ready to serve queries. */
export const dbReady: Promise<void> = created.ready;
