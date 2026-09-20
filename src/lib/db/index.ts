import "server-only";

import { cache } from "react";

import { DrizzleAuthStore, DrizzleRepository } from "./drizzle-store";
import { protectDatabaseErrors } from "./database-errors";
import { resolveNeonRuntimeUrl } from "@/db/connection-url";
import type { Dataset } from "../types";
import { JsonAuthStore, JsonRepository } from "./json-store";
import { PrismaAuthStore, PrismaRepository } from "./prisma-store";
import type { AuthStore, Repository } from "./repository";

/**
 * Storage selection.
 *
 *   DATA_SOURCE=json      (default) -- local seeded JSON file, zero setup.
 *   DATA_SOURCE=postgres            -- Prisma against DATABASE_URL.
 *   DATA_SOURCE=neon                -- Drizzle against NEON_DATABASE_URL.
 *
 * Explicit Neon selection fails closed if its URL is absent; it never writes
 * to JSON as a fallback. Other values preserve the existing selection behavior.
 * A half-configured legacy environment still
 * boots instead of crashing on a missing connection string. PrismaRepository
 * only imports @prisma/client lazily, so the JSON path never touches it.
 */

let authStore: { mode: ReturnType<typeof storageMode>; store: AuthStore } | null = null;

export function usingNeon(): boolean {
  return process.env.DATA_SOURCE === "neon";
}

export function usingPostgres(): boolean {
  return usingNeon() || (
    process.env.DATA_SOURCE === "postgres" &&
    typeof process.env.DATABASE_URL === "string" &&
    process.env.DATABASE_URL.startsWith("postgres")
  );
}

/**
 * A repository bound to one business.
 *
 * The businessId comes from the signed session, never from user input, so a
 * request can only ever reach its own rows. Nothing in the app may call this
 * without a session behind it.
 */
export function getRepository(businessId: string): Repository {
  if (!businessId) throw new Error("A businessId is required to read or write data.");
  if (usingNeon()) {
    resolveNeonRuntimeUrl(process.env);
    return protectDatabaseErrors(new DrizzleRepository(businessId));
  }
  return usingPostgres() ? new PrismaRepository(businessId) : new JsonRepository(businessId);
}

/**
 * One authoritative ledger snapshot per business and Server Component render.
 *
 * App layouts and pages are separate components, so calling the repository in
 * both used to execute the complete set of Postgres queries twice on a first
 * page load. React cache is request/render scoped: it deduplicates that work
 * without retaining one customer's books for a later request.
 */
export const getDataset = cache(async (businessId: string): Promise<Dataset> => {
  return getRepository(businessId).getDataset();
});

/** Account lookups, which establish which business a request belongs to. */
export function getAuthStore(): AuthStore {
  const mode = storageMode();
  if (mode === "neon") resolveNeonRuntimeUrl(process.env);
  if (authStore?.mode !== mode) {
    const store = mode === "neon" ? protectDatabaseErrors(new DrizzleAuthStore())
      : mode === "postgres" ? new PrismaAuthStore() : new JsonAuthStore();
    authStore = { mode, store };
  }
  return authStore.store;
}

export function storageMode(): "neon" | "postgres" | "json" {
  return usingNeon() ? "neon" : usingPostgres() ? "postgres" : "json";
}
