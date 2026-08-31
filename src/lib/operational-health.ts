import "server-only";

import { checkPostgresConnection } from "@/lib/db/prisma-store";
import { usingPostgres } from "@/lib/db";
import { stripeBillingConfigured } from "@/lib/stripe";
import { getDocumentStorage, storageBackend } from "@/lib/storage";
import { operationalLog } from "@/lib/operations";

export type HealthCheck = { status: "ok" | "error"; latencyMs?: number };

export interface HealthReport {
  status: "ok" | "degraded";
  timestamp: string;
  checks: {
    application: HealthCheck;
    database: HealthCheck;
    storage: HealthCheck;
    billing: HealthCheck;
    auth: HealthCheck;
  };
}

async function timedCheck(name: string, check: () => Promise<void>): Promise<HealthCheck> {
  const startedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${name} health check timed out`)),
          5_000,
        );
      }),
    ]);
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (error) {
    operationalLog("error", "Health dependency failed", {
      dependency: name,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    });
    return { status: "error", latencyMs: Date.now() - startedAt };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function configured(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function buildHealthReport(): Promise<HealthReport> {
  const production = process.env.VERCEL_ENV === "production";
  const databaseModeOk = usingPostgres() || !production;
  const currentStorage = storageBackend();
  const storageModeOk = currentStorage === "supabase" || !production;

  const [database, storage] = await Promise.all([
    databaseModeOk
      ? timedCheck("database", usingPostgres() ? checkPostgresConnection : async () => undefined)
      : Promise.resolve<HealthCheck>({ status: "error" }),
    storageModeOk
      ? timedCheck("storage", async () => {
          await getDocumentStorage().healthcheck?.();
        })
      : Promise.resolve<HealthCheck>({ status: "error" }),
  ]);

  const billing: HealthCheck = { status: stripeBillingConfigured() ? "ok" : "error" };
  const auth: HealthCheck = {
    status: [
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    ].every(configured)
      ? "ok"
      : "error",
  };
  const checks = {
    application: { status: "ok" as const },
    database,
    storage,
    billing,
    auth,
  };
  const status = Object.values(checks).every((check) => check.status === "ok")
    ? "ok"
    : "degraded";

  return { status, timestamp: new Date().toISOString(), checks };
}
