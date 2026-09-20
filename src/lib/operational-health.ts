import "server-only";

import { usingAuthJs } from "@/lib/auth/provider";
import { checkPostgresConnection } from "@/lib/db/prisma-store";
import { checkNeonDatabase } from "@/db";
import { usingNeon, usingPostgres } from "@/lib/db";
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

async function timedCheck(
  name: string,
  check: () => Promise<void>,
): Promise<HealthCheck> {
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

  const [database, storage] = await Promise.all([
    databaseModeOk
      ? timedCheck(
          "database",
          usingNeon()
            ? async () => {
                await checkNeonDatabase();
              }
            : usingPostgres()
              ? checkPostgresConnection
              : async () => undefined,
        )
      : Promise.resolve<HealthCheck>({ status: "error" }),
    timedCheck("storage", async () => {
      if (production && storageBackend() === "local")
        throw new Error("Production requires private object storage.");
      await getDocumentStorage().healthcheck?.();
    }),
  ]);

  const billing: HealthCheck = {
    status: stripeBillingConfigured() ? "ok" : "error",
  };
  const auth: HealthCheck = {
    status: (usingAuthJs()
      ? [
          process.env.AUTH_SECRET,
          process.env.AUTH_GOOGLE_ID,
          process.env.AUTH_GOOGLE_SECRET,
          process.env.RESEND_API_KEY,
        ]
      : [
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        ]
    ).every(configured)
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
