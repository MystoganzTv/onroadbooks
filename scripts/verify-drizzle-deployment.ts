import "dotenv/config";
import { Client } from "pg";
import { resolveNeonMigrationUrl } from "../src/db/connection-url";
import { verifyDrizzleDeployment } from "./lib/verify-drizzle-deployment";
async function main() {
  const url = new URL(resolveNeonMigrationUrl(process.env));
  if (!url.hostname.endsWith(".neon.tech") || url.hostname.includes("-pooler"))
    throw new Error("Verification requires a direct Neon connection.");
  url.searchParams.set("sslmode", "verify-full");
  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 15_000,
  });
  try {
    await client.connect();
    console.log(
      "Deployed Drizzle schema verified:",
      await verifyDrizzleDeployment(client),
    );
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error && error.name === "AssertionError"
      ? error.message
      : "Drizzle deployment verification failed; connection/SQL details withheld.",
  );
  process.exitCode = 1;
});
