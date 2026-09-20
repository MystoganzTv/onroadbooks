import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getNeonDatabase, closeNeonDatabase } from "../src/db";
import { business } from "../src/db/schema";
import {
  DrizzleRepository,
  DrizzleAuthStore,
} from "../src/lib/db/drizzle-store";
import { accountRepositoryContract } from "./lib/account-repository-contract";

async function main() {
  const hostname = new URL(process.env.NEON_DATABASE_URL ?? "").hostname;
  assert.ok(
    [
      "ep-polished-night-awxqexhq.c-12.us-east-1.aws.neon.tech",
      "ep-polished-night-awxqexhq-pooler.c-12.us-east-1.aws.neon.tech",
    ].includes(hostname),
    "Only the audited OnRoadBooks Neon development destination is allowed",
  );
  const db = getNeonDatabase();
  const marker = `repository-smoke-${randomUUID()}`;
  const rollback = new Error("Intentional smoke rollback");
  try {
    await assert.rejects(
      db.transaction(
        async (tx) => {
          await tx
            .insert(business)
            .values({ id: marker, name: "Temporary repository smoke" });
          const provider = async () => tx;
          await accountRepositoryContract(
            new DrizzleAuthStore(provider),
            (id) => new DrizzleRepository(id, provider),
          );
          throw rollback;
        },
        { isolationLevel: "serializable" },
      ),
      (error) => error === rollback,
    );
    assert.equal(
      await db.query.business.findFirst({ where: eq(business.id, marker) }),
      undefined,
    );
    console.log(
      "Neon repository verified: credentials, roles, isolation, financial writes, settlement snapshot, reset/delete and rollback. No test records retained.",
    );
  } finally {
    await closeNeonDatabase();
  }
}
main().catch(() => {
  console.error(
    "Neon repository smoke failed; transaction rolled back. Inspect locally without exposing row values or credentials.",
  );
  process.exitCode = 1;
});
