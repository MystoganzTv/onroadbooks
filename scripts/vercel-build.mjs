import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const isVercelProduction =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

if (isVercelProduction) {
  console.log("Applying and verifying production database migrations before build...");
  run(npm, ["run", "db:migrate:deploy"]);
  run(npm, ["run", "db:harden"]);
  run(npm, ["run", "db:migrate:verify"]);
} else {
  console.log("Skipping production database migrations outside Vercel Production.");
}

run(npm, ["run", "build"]);
