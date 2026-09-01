import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { config as loadEnv } from "dotenv";

import { buildBackupEmail } from "./lib/backup-email";

loadEnv({ path: ".env.local" });
loadEnv();

/**
 * Mails an encrypted backup to the owner.
 *
 * The repository is public, so a nightly backup cannot be kept as a workflow
 * artifact -- those are world-readable, and an encrypted ledger on the open
 * internet is a countdown rather than a backup. Actions SECRETS are still
 * secret in a public repo, so the job can run; it just needs somewhere private
 * to put the file.
 *
 * That somewhere is his inbox, through the Resend account that already sends
 * this app's auth mail and its error alerts. No bucket, no new vendor, no
 * account to remember, and the file is AES-256-GCM ciphertext under a
 * passphrase Resend and Gmail never see.
 *
 *   npm run backup:mail -- <file>
 */

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run backup:mail -- <file>");

  const key = process.env.RESEND_API_KEY?.trim();
  const to = process.env.BACKUP_EMAIL?.trim() || process.env.OPERATIONS_ALERT_EMAIL?.trim();
  if (!key || !to) {
    throw new Error("RESEND_API_KEY and BACKUP_EMAIL are required to mail a backup.");
  }

  const bytes = await readFile(file);
  await stat(file);
  const payload = buildBackupEmail(
    path.basename(file),
    bytes,
    to,
    process.env.BACKUP_EMAIL_FROM?.trim() || "OnRoad Books <no-reply@onroadbooks.com>",
  );

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Resend refused the backup email (${response.status}).`);
  }

  console.log("Backup mailed:", {
    file: path.basename(file),
    bytes: bytes.byteLength,
    recipients: payload.to.length,
  });
}

main().catch((error) => {
  console.error("Mailing the backup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
