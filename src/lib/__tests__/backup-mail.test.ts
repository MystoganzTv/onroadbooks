import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBackupEmail } from "../../../scripts/lib/backup-email";

const from = "OnRoad Books <no-reply@onroadbooks.com>";

describe("mailing an encrypted backup", () => {
  it("attaches the file base64 encoded, under its own name", () => {
    const bytes = Buffer.from("ORBK1-not-really-a-dump");
    const email = buildBackupEmail("onroadbooks-20260901T081000Z.dump.enc", bytes, "me@example.com", from);

    assert.equal(email.attachments.length, 1);
    assert.equal(email.attachments[0].filename, "onroadbooks-20260901T081000Z.dump.enc");
    assert.equal(
      Buffer.from(email.attachments[0].content, "base64").toString(),
      "ORBK1-not-really-a-dump",
    );
    assert.deepEqual(email.to, ["me@example.com"]);
  });

  it("takes more than one recipient", () => {
    const email = buildBackupEmail("x.dump.enc", Buffer.from("x"), "a@example.com, b@example.com", from);
    assert.deepEqual(email.to, ["a@example.com", "b@example.com"]);
  });

  it("tells you how to open it, and that the passphrase is the only way", () => {
    const email = buildBackupEmail("x.dump.enc", Buffer.from("x"), "me@example.com", from);
    assert.match(email.text, /--decrypt/);
    assert.match(email.text, /BACKUP_PASSPHRASE/);
  });

  it("refuses to mail a dump too big for email instead of sending half a ledger", () => {
    // The day this throws is the day nightly backups need object storage, and
    // a loud failure is the only honest way to find that out.
    const huge = Buffer.alloc(40 * 1024 * 1024);
    assert.throws(
      () => buildBackupEmail("x.dump.enc", huge, "me@example.com", from),
      /object storage/,
    );
  });
});
