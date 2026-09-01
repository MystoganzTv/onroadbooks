/**
 * The email that carries an encrypted backup.
 *
 * Kept apart from the script that sends it so it can be tested without running
 * anything — importing an entry point to test it is how a test suite ends up
 * mailing a real backup.
 */

/** Resend's own ceiling. A dump that outgrows it needs object storage, and the
 *  run must fail loudly and say so rather than mail half a ledger. */
export const MAX_ATTACHMENT_BYTES = 38 * 1024 * 1024;

export interface BackupEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  attachments: { filename: string; content: string }[];
}

export function buildBackupEmail(
  fileName: string,
  bytes: Buffer,
  to: string,
  from: string,
): BackupEmail {
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `Backup is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, past what email carries. ` +
        "Move nightly backups to object storage.",
    );
  }

  const size = `${(bytes.byteLength / 1024).toFixed(0)} KB`;
  return {
    from,
    to: to.split(",").map((address) => address.trim()).filter(Boolean),
    subject: `OnRoad Books backup — ${fileName}`,
    text: [
      "Encrypted nightly backup of the OnRoad Books ledger.",
      "",
      `File: ${fileName}`,
      `Size: ${size}`,
      "",
      "It was decrypted and read back with pg_restore before this was sent, so",
      "every application table is known to be in it.",
      "",
      "To restore:",
      "  npm run backup -- --decrypt <this file> --out ledger.dump",
      "  pg_restore --dbname <target> --no-owner --no-privileges ledger.dump",
      "",
      "It opens with BACKUP_PASSPHRASE and nothing else. Lose that and this",
      "attachment is noise.",
    ].join("\n"),
    attachments: [{ filename: fileName, content: bytes.toString("base64") }],
  };
}
