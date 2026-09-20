import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveNeonMigrationUrl,
  resolveNeonRuntimeUrl,
} from "../../db/connection-url";

test("Neon runtime uses only the isolated pooled connection", () => {
  assert.equal(
    resolveNeonRuntimeUrl({
      NEON_DATABASE_URL: "postgresql://pooled.example.test/onroad",
      NEON_DIRECT_URL: "postgresql://direct.example.test/onroad",
    }),
    "postgresql://pooled.example.test/onroad",
  );
});

test("Drizzle migrations prefer the direct Neon connection", () => {
  assert.equal(
    resolveNeonMigrationUrl({
      NEON_DATABASE_URL: "postgresql://pooled.example.test/onroad",
      NEON_DIRECT_URL: "postgresql://direct.example.test/onroad",
    }),
    "postgresql://direct.example.test/onroad",
  );
});

test("Drizzle migrations can fall back to the pooled Neon connection", () => {
  assert.equal(
    resolveNeonMigrationUrl({
      NEON_DATABASE_URL: "postgresql://pooled.example.test/onroad",
      NEON_DIRECT_URL: "  ",
    }),
    "postgresql://pooled.example.test/onroad",
  );
});

test("Neon connection variables are required and must be PostgreSQL URLs", () => {
  assert.throws(
    () => resolveNeonRuntimeUrl({}),
    /NEON_DATABASE_URL is required/,
  );
  assert.throws(
    () => resolveNeonRuntimeUrl({ NEON_DATABASE_URL: "https://example.test" }),
    /postgres or postgresql protocol/,
  );
});
