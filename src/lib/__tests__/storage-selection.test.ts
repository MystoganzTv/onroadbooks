import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { getRepository, getAuthStore, storageMode, usingPostgres } from "../db";
import { DrizzleAuthStore, DrizzleRepository } from "../db/drizzle-store";
import { JsonRepository } from "../db/json-store";
import { PrismaRepository } from "../db/prisma-store";
const original = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env))
    if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});
it("explicit Neon selection never falls back to JSON on missing or invalid credentials", () => {
  process.env.DATA_SOURCE = "neon";
  delete process.env.NEON_DATABASE_URL;
  assert.equal(storageMode(), "neon");
  assert.equal(usingPostgres(), true);
  assert.throws(() => getRepository("business"), /NEON_DATABASE_URL/);
  assert.throws(() => getAuthStore(), /NEON_DATABASE_URL/);
  process.env.NEON_DATABASE_URL = "https://invalid.example.test";
  assert.throws(() => getRepository("business"), /postgres/);
});
it("selects Drizzle lazily and retains explicit Prisma and JSON rollback paths", () => {
  process.env.DATA_SOURCE = "neon";
  process.env.NEON_DATABASE_URL = "postgresql://test@127.0.0.1:1/test";
  assert.ok(getRepository("business") instanceof DrizzleRepository);
  assert.ok(getAuthStore() instanceof DrizzleAuthStore);
  process.env.DATA_SOURCE = "postgres";
  process.env.DATABASE_URL = "postgresql://test@127.0.0.1:1/test";
  assert.ok(getRepository("business") instanceof PrismaRepository);
  process.env.DATA_SOURCE = "json";
  assert.ok(getRepository("business") instanceof JsonRepository);
});
