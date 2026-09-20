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
  "DriverSettlementAdjustment",
  "FinancialSettings",
  "Truck",
  "Load",
  "Expense",
  "FinancialObligation",
  "PaymentEvent",
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
  for (const parameter of [
    "schema",
    "pgbouncer",
    "connection_limit",
    "pool_timeout",
  ]) {
    url.searchParams.delete(parameter);
  }
  return url.toString();
}

/**
 * Supabase uses PostgreSQL 17 and Neon uses 18. Older client tools refuse the
 * dump outright, and macOS ships an ancient `pg_dump` on the default PATH, so
 * look through Homebrew's keg first and verify the major version before use.
 */
export function pgBinary(name: string, minimumMajor = 17): string {
  const configured = process.env.PG_BIN?.trim();
  const candidates = configured
    ? [path.join(configured, name)]
    : [
        `/opt/homebrew/opt/postgresql@18/bin/${name}`,
        `/usr/local/opt/postgresql@18/bin/${name}`,
        `/opt/homebrew/opt/libpq/bin/${name}`,
        `/usr/local/opt/libpq/bin/${name}`,
        `/opt/homebrew/opt/postgresql@17/bin/${name}`,
        `/usr/local/opt/postgresql@17/bin/${name}`,
        name,
      ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    const major = Number(result.stdout?.match(/(\d+)(?:\.\d+)?/)?.[1] ?? 0);
    if (result.status === 0 && major >= minimumMajor) return candidate;
  }
  throw new Error(
    `PostgreSQL ${minimumMajor}+ tooling is required (${name}${configured ? " in PG_BIN" : ""} was not found).`,
  );
}

/**
 * Run a tool and fail loudly. Output is captured rather than inherited so a
 * connection string in an error message never lands in a terminal scrollback
 * even when a command fails.
 */
export function run(binary: string, args: string[], label: string): void {
  const result = spawnSync(binary, args, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (exit ${result.status ?? "unknown"}); output withheld to protect connection credentials.`,
    );
  }
}
