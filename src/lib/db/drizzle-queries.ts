import "server-only";
import { randomUUID } from "node:crypto";
import { getTableColumns, type InferInsertModel, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { NeonDatabase } from "@/db";

export type DatabaseExecutor = Pick<
  NeonDatabase,
  "select" | "insert" | "update" | "delete" | "query" | "transaction"
>;

type Data<T extends PgTable> = {
  [K in keyof InferInsertModel<T>]?:
    | InferInsertModel<T>[K]
    | SQL
    | (K extends keyof T["_"]["columns"]
        ? T["_"]["columns"][K]["columnType"] extends "PgNumeric"
          ? number
          : never
        : never);
};

/** Preserve the existing domain's number inputs; PostgreSQL receives decimal strings. */
export function updateValues<T extends PgTable>(
  table: T,
  data: Data<NoInfer<T>>,
): Partial<InferInsertModel<T>> {
  const columns = getTableColumns(table);
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (!(key in columns)) throw new Error(`Unknown field ${key}`);
        if (
          columns[key].columnType === "PgNumeric" &&
          typeof value === "number"
        ) {
          if (!Number.isFinite(value))
            throw new Error(`Invalid numeric field ${key}`);
          return [key, String(value)];
        }
        return [key, value];
      }),
  ) as Partial<InferInsertModel<T>>;
}

export function insertValues<T extends PgTable>(
  table: T,
  data: Data<NoInfer<T>>,
): InferInsertModel<T> {
  return {
    id: randomUUID(),
    ...updateValues(table, data),
  } as InferInsertModel<T>;
}

export async function oneRow<T>(query: PromiseLike<T[]>): Promise<T> {
  const rows = await query;
  if (rows.length !== 1)
    throw new Error("The requested record no longer exists.");
  return rows[0];
}
export async function affectedRows(
  query: PromiseLike<unknown[]>,
): Promise<{ count: number }> {
  return { count: (await query).length };
}
export async function countRows(
  query: PromiseLike<{ value: number }[]>,
): Promise<number> {
  return (await query)[0]?.value ?? 0;
}
