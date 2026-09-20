import { test } from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt } from "../../../scripts/lib/backup-crypto";
import { dependencyOrder, quoteIdentifier } from "../../../scripts/lib/data-copy";

test("migration archives preserve the backup format and reject tampering/wrong keys", async () => {
  const bytes = Buffer.from('sensitive fixture: ñ / null / 9999999999.99');
  const secret = "test-only-passphrase";
  const archive = await encrypt(bytes, secret);
  assert.equal(archive.subarray(0, 5).toString(), "ORBK1");
  assert.ok((await decrypt(archive, secret)).equals(bytes));
  await assert.rejects(decrypt(archive, "wrong-passphrase"));
  archive[50] ^= 1;
  await assert.rejects(decrypt(archive, secret));
  await assert.rejects(decrypt(archive.subarray(0, 30), secret));
});

test("copy order follows foreign keys and refuses cycles", () => {
  assert.deepEqual(dependencyOrder(["Load", "Business", "Truck"], [{child:"Load",parent:"Truck"},{child:"Truck",parent:"Business"}]), ["Business", "Truck", "Load"]);
  assert.throws(() => dependencyOrder(["A", "B"], [{child:"A",parent:"B"},{child:"B",parent:"A"}]), /Cyclic/);
  assert.equal(quoteIdentifier('a"b'), '"a""b"');
});
