import { it } from "node:test";
import assert from "node:assert/strict";
import { productionBuildPlan } from "../../../scripts/lib/deployment-plan.mjs";
it("preview/local builds never mutate a database", () => {
  assert.deepEqual(productionBuildPlan({ DATA_SOURCE: "neon" }), ["build"]);
  assert.deepEqual(
    productionBuildPlan({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      DATA_SOURCE: "neon",
    }),
    ["build"],
  );
});
it("production selects exactly one migration system and verifies before build", () => {
  const env = { VERCEL: "1", VERCEL_ENV: "production" };
  assert.deepEqual(productionBuildPlan(env), [
    "db:migrate:deploy",
    "db:harden",
    "db:migrate:verify",
    "build",
  ]);
  assert.deepEqual(
    productionBuildPlan({
      ...env,
      DATA_SOURCE: "neon",
      NEON_DATABASE_URL: "postgresql://test@ep-test-pooler.neon.tech/neondb",
      NEON_DIRECT_URL: "postgresql://test@ep-test.neon.tech/neondb",
    }),
    ["db:drizzle:migrate", "db:drizzle:verify", "build"],
  );
  assert.throws(
    () => productionBuildPlan({ ...env, DATA_SOURCE: "json" }),
    /PostgreSQL backend/,
  );
  assert.throws(
    () => productionBuildPlan({ ...env, DATA_SOURCE: "neon" }),
    /NEON_DATABASE_URL/,
  );
});
it("runtime and migration destinations cannot split production data", () => {
  const env = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    DATA_SOURCE: "neon",
    NEON_DATABASE_URL: "postgresql://test@ep-test-pooler.neon.tech/neondb",
    NEON_DIRECT_URL: "postgresql://test@ep-test.neon.tech/neondb",
  };
  for (const direct of [
    "postgresql://test@source.supabase.co/postgres",
    "postgresql://test@ep-test-pooler.neon.tech/neondb",
    "postgresql://test@ep-other.neon.tech/neondb",
    "postgresql://test@ep-test.neon.tech/other",
  ])
    assert.throws(() =>
      productionBuildPlan({ ...env, NEON_DIRECT_URL: direct }),
    );
});
