import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * Every table the application owns. Operational scripts iterate this list to
 * prove a database, a dump or a restore is complete, so a new model in
 * `prisma/schema.prisma` has to be added here too -- otherwise a table can go
 * missing from a backup and nothing fails.
 */
export const APPLICATION_TABLES = [
  "User",
  "Business",
  "FinancialGoal",
  "Subscription",
  "ReserveAccount",
  "ReserveTransaction",
  "Settlement",
  "Driver",
  "DriverSettlement",
  "DriverSettlementLine",
  "FinancialSettings",
  "Truck",
  "Load",
  "Expense",
  "FuelEntry",
  "MaintenanceRecord",
  "Document",
] as const;

/**
 * Supabase hands out a pooled connection string. `pg_dump` and `pg_restore`
 * speak to the database directly and choke on the pooler's query parameters,
 * so strip them rather than asking every caller to remember.
 */
export function databaseUrl(source: string): string {
  const url = new URL(source);
  for (const parameter of ["schema", "pgbouncer", "connection_limit", "pool_timeout"]) {
    url.searchParams.delete(parameter);
  }
  return url.toString();
}

/**
 * Production runs PostgreSQL 17. Client tools older than the server refuse the
 * dump outright, and macOS ships an ancient `pg_dump` on the default PATH, so
 * look through Homebrew's keg first and verify the major version before use.
 */
export function pgBinary(name: string): string {
  const configured = process.env.PG_BIN?.trim();
  const candidates = [
    configured ? path.join(configured, name) : null,
    `/opt/homebrew/opt/postgresql@17/bin/${name}`,
    `/usr/local/opt/postgresql@17/bin/${name}`,
    name,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    const major = Number(result.stdout?.match(/(\d+)(?:\.\d+)?/)?.[1] ?? 0);
    if (result.status === 0 && major >= 17) return candidate;
  }
  throw new Error(`PostgreSQL 17 tooling is required (${name} was not found).`);
}

/**
 * Run a tool and fail loudly. Output is captured rather than inherited so a
 * connection string in an error message never lands in a terminal scrollback
 * unless the command actually failed.
 */
export function run(binary: string, args: string[], label: string): void {
  const result = spawnSync(binary, args, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(`${label} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
}
