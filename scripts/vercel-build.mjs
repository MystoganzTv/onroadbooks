import { spawnSync } from "node:child_process";
import { productionBuildPlan } from "./lib/deployment-plan.mjs";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
try {
  const plan = productionBuildPlan(process.env);
  console.log(
    plan.length > 1
      ? "Applying and verifying migrations for the configured production backend..."
      : "Skipping production database migrations outside Vercel Production.",
  );
  for (const script of plan) {
    const result = spawnSync(npm, ["run", script], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Production build configuration failed.",
  );
  process.exitCode = 1;
}
