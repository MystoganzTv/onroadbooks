import "dotenv/config";

import assert from "node:assert/strict";

import { checkNeonDatabase, closeNeonDatabase } from "../src/db";

async function main() {
  try {
    const result = await checkNeonDatabase();

    assert.equal(result?.ok, 1);
    assert.ok(result.databaseName);

    console.log(`Neon + Drizzle smoke check passed (${result.databaseName}).`);
  } finally {
    await closeNeonDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Neon smoke check failed.");
  process.exitCode = 1;
});
