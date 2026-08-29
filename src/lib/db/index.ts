import "server-only";

import { JsonAuthStore, JsonRepository } from "./json-store";
import { PrismaAuthStore, PrismaRepository } from "./prisma-store";
import type { AuthStore, Repository } from "./repository";

/**
 * Storage selection.
 *
 *   DATA_SOURCE=json      (default) -- local seeded JSON file, zero setup.
 *   DATA_SOURCE=postgres            -- Prisma against DATABASE_URL.
 *
 * Anything else falls back to JSON so a half-configured environment still
 * boots instead of crashing on a missing connection string. PrismaRepository
 * only imports @prisma/client lazily, so the JSON path never touches it.
 */

let authStore: AuthStore | null = null;

export function usingPostgres(): boolean {
  return (
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
  return usingPostgres() ? new PrismaRepository(businessId) : new JsonRepository(businessId);
}

/** Account lookups, which establish which business a request belongs to. */
export function getAuthStore(): AuthStore {
  if (!authStore) {
    authStore = usingPostgres() ? new PrismaAuthStore() : new JsonAuthStore();
  }
  return authStore;
}

export function storageMode(): "postgres" | "json" {
  return usingPostgres() ? "postgres" : "json";
}
