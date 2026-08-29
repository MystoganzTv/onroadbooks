import "server-only";

import { JsonRepository } from "./json-store";
import { PrismaRepository } from "./prisma-store";
import type { Repository } from "./repository";

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

let instance: Repository | null = null;

export function usingPostgres(): boolean {
  return (
    process.env.DATA_SOURCE === "postgres" &&
    typeof process.env.DATABASE_URL === "string" &&
    process.env.DATABASE_URL.startsWith("postgres")
  );
}

export function getRepository(): Repository {
  if (!instance) {
    instance = usingPostgres() ? new PrismaRepository() : new JsonRepository();
  }
  return instance;
}

export function storageMode(): "postgres" | "json" {
  return usingPostgres() ? "postgres" : "json";
}
