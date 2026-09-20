import "server-only";

import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { resolveNeonRuntimeUrl } from "./connection-url";
import * as schema from "./schema";

export type NeonDatabase = NodePgDatabase<typeof schema>;

type NeonState = {
  database: NeonDatabase;
  pool: Pool;
};

const globalForNeon = globalThis as typeof globalThis & {
  onroadNeonState?: NeonState;
};

function createNeonState(): NeonState {
  const pool = new Pool({
    connectionString: resolveNeonRuntimeUrl(process.env),
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });

  pool.on("error", (error) => {
    console.error("Unexpected Neon pool error", error);
  });

  return {
    database: drizzle(pool, { schema }),
    pool,
  };
}

function getNeonState() {
  globalForNeon.onroadNeonState ??= createNeonState();
  return globalForNeon.onroadNeonState;
}

export function getNeonDatabase() {
  return getNeonState().database;
}

export async function checkNeonDatabase() {
  const database = getNeonDatabase();
  const result = await database.transaction(
    (transaction) =>
      transaction.execute<{
        databaseName: string;
        ok: number;
      }>(sql`
        select current_database() as "databaseName", 1::integer as ok
      `),
    {
      isolationLevel: "serializable",
      accessMode: "read only",
    },
  );

  return result.rows[0];
}

export async function closeNeonDatabase() {
  const state = globalForNeon.onroadNeonState;
  if (!state) return;

  delete globalForNeon.onroadNeonState;
  await state.pool.end();
}
