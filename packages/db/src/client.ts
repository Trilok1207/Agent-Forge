import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  kind: "postgres" | "pglite";
  migrate(migrationsFolder?: string): Promise<void>;
  close(): Promise<void>;
}

/** Migrations folder when running from source (dev, tests). Bundles pass their own copy. */
export const migrationsDir = fileURLToPath(new URL("../drizzle", import.meta.url));

/**
 * `url` set → real Postgres (production, docker-compose).
 * `url` unset → embedded PGlite: in-memory, or persisted to `pgliteDir`. Dev/test only.
 */
export function createDb(opts: { url?: string; pgliteDir?: string } = {}): DbHandle {
  if (opts.url) {
    const pool = new pg.Pool({ connectionString: opts.url, max: 10 });
    const db = drizzlePg(pool, { schema }) as unknown as Db;
    return {
      db,
      kind: "postgres",
      migrate: (folder = migrationsDir) => migratePg(drizzlePg(pool), { migrationsFolder: folder }),
      close: () => pool.end(),
    };
  }
  const client = new PGlite(opts.pgliteDir);
  const lite = drizzlePglite(client, { schema });
  return {
    db: lite as unknown as Db,
    kind: "pglite",
    migrate: (folder = migrationsDir) => migratePglite(lite, { migrationsFolder: folder }),
    close: () => client.close(),
  };
}
