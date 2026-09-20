import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getNeonDatabase, closeNeonDatabase } from "../src/db";
import { business } from "../src/db/schema";
import { authRepositoryContract } from "./lib/auth-repository-contract";
async function main() {
  const hostname = new URL(process.env.NEON_DATABASE_URL ?? "").hostname;
  assert.ok(
    [
      "ep-polished-night-awxqexhq.c-12.us-east-1.aws.neon.tech",
      "ep-polished-night-awxqexhq-pooler.c-12.us-east-1.aws.neon.tech",
    ].includes(hostname),
  );
  const db = getNeonDatabase();
  const marker = `auth-smoke-${randomUUID()}`;
  const rollback = new Error("Intentional auth rollback");
  await assert.rejects(
    db.transaction(
      async (tx) => {
        await tx
          .insert(business)
          .values({ id: marker, name: "Temporary auth smoke" });
        await authRepositoryContract(tx);
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
    "Neon Auth contract passed: existing IDs, verified Google subjects, invitations, password setup, expiration, one-time redemption, deletion and rollback.",
  );
}
main()
  .catch(() => {
    console.error("Neon auth verification failed; no private data printed.");
    process.exitCode = 1;
  })
  .finally(closeNeonDatabase);
