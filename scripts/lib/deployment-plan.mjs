/** Deterministic build policy, kept free of I/O so it can be verified without deploying. */
export function productionBuildPlan(env) {
  const production = env.VERCEL === "1" && env.VERCEL_ENV === "production";
  if (!production) return ["build"];
  const source = env.DATA_SOURCE?.trim() || "postgres";
  if (source === "neon") {
    for (const key of ["NEON_DATABASE_URL", "NEON_DIRECT_URL"]) {
      let url;
      try {
        url = new URL(env[key]);
      } catch {
        throw new Error(
          `${key} must be configured before production migrations.`,
        );
      }
      if (
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        !url.hostname.endsWith(".neon.tech")
      )
        throw new Error(`${key} must target Neon PostgreSQL.`);
      if (key === "NEON_DIRECT_URL" && url.hostname.includes("-pooler"))
        throw new Error("NEON_DIRECT_URL must use the direct endpoint.");
    }
    const runtime = new URL(env.NEON_DATABASE_URL);
    const direct = new URL(env.NEON_DIRECT_URL);
    if (
      runtime.hostname.replace("-pooler", "") !== direct.hostname ||
      runtime.pathname !== direct.pathname
    )
      throw new Error(
        "Neon runtime and migrations must use the same endpoint and database.",
      );
    return ["db:drizzle:migrate", "db:drizzle:verify", "build"];
  }
  if (source !== "postgres")
    throw new Error("Production requires an explicit PostgreSQL backend.");
  return ["db:migrate:deploy", "db:harden", "db:migrate:verify", "build"];
}
