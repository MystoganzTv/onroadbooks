import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getNeonDatabase, closeNeonDatabase } from "../src/db";
import { authIdentity, user } from "../src/db/schema";
import { decrypt } from "./lib/backup-crypto";
config({ path: ".env.local" });
config();

const inventory = z.object({
  version: z.literal(1),
  source: z.literal("uznuvzeghgwygpxjhqdz"),
  identities: z
    .array(
      z.object({
        provider: z.literal("google"),
        provider_id: z.string().min(1),
        email: z.string().email(),
        email_confirmed_at: z.string().min(1),
        application_user_id: z.string().min(1),
        business_id: z.string().min(1),
      }),
    )
    .min(1),
});
async function main() {
  const args = process.argv.slice(2);
  assert.ok(
    args.length <= 1 &&
      args.every((arg) => ["--check", "--apply"].includes(arg)),
  );
  const url = new URL(process.env.NEON_DATABASE_URL ?? "");
  assert.ok(
    [
      "ep-polished-night-awxqexhq.c-12.us-east-1.aws.neon.tech",
      "ep-polished-night-awxqexhq-pooler.c-12.us-east-1.aws.neon.tech",
    ].includes(url.hostname),
  );
  assert.ok(process.env.MIGRATION_IDENTITIES_FILE);
  assert.ok((process.env.BACKUP_PASSPHRASE?.length ?? 0) >= 12);
  const document = inventory.parse(
    JSON.parse(
      (
        await decrypt(
          await readFile(process.env.MIGRATION_IDENTITIES_FILE!),
          process.env.BACKUP_PASSPHRASE!,
        )
      ).toString("utf8"),
    ),
  );
  const apply = args[0] === "--apply";
  const rollback = new Error("Identity dry run rollback");
  try {
    await getNeonDatabase().transaction(
      async (tx) => {
        for (const identity of document.identities) {
          const appUser = await tx.query.user.findFirst({
            where: eq(user.id, identity.application_user_id),
          });
          assert.ok(
            appUser &&
              appUser.businessId === identity.business_id &&
              appUser.email.toLowerCase() === identity.email.toLowerCase(),
            "Identity inventory no longer matches application data",
          );
          await tx
            .insert(authIdentity)
            .values({
              id: randomUUID(),
              userId: appUser.id,
              provider: "google",
              subject: identity.provider_id,
            })
            .onConflictDoNothing();
          const [linked] = await tx
            .select()
            .from(authIdentity)
            .where(
              and(
                eq(authIdentity.provider, "google"),
                eq(authIdentity.subject, identity.provider_id),
              ),
            );
          assert.equal(
            linked?.userId,
            appUser.id,
            "Conflicting identity mapping",
          );
        }
        if (!apply) throw rollback;
      },
      { isolationLevel: "serializable" },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  console.log(
    JSON.stringify({
      googleIdentities: document.identities.length,
      applied: apply,
      existingUserIdsPreserved: true,
    }),
  );
}
main()
  .catch(() => {
    console.error("Identity import failed; no private values printed.");
    process.exitCode = 1;
  })
  .finally(closeNeonDatabase);
