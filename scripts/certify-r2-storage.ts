import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { R2DocumentStorage, r2Configuration } from "../src/lib/storage/r2";
import {
  chunkKey,
  DOCUMENT_CHUNK_BYTES,
  finishChunkedUpload,
} from "../src/lib/storage/chunked-upload";
config({ path: ".env.local" });
config();

async function main() {
  assert.notEqual(
    process.env.ONROAD_DISPOSABLE_STORAGE,
    "1",
    "Live certification cannot use a fixture.",
  );
  const configuration = r2Configuration(process.env);
  const client = new S3Client(configuration.client);
  const storage = new R2DocumentStorage(client, configuration.bucket);
  const key = `_certification/${randomUUID()}/large.pdf`;
  const bytes = Buffer.alloc(10 * 1024 * 1024, 7);
  bytes.write("%PDF-1.7\nOnRoadBooks disposable storage certification\n");
  const digest = (data: Buffer) =>
    createHash("sha256").update(data).digest("hex");
  let verified = false;
  try {
    await storage.healthcheck();
    for (let part = 0; part < 5; part++)
      await storage.put(
        chunkKey(key, part),
        bytes.subarray(
          part * DOCUMENT_CHUNK_BYTES,
          (part + 1) * DOCUMENT_CHUNK_BYTES,
        ),
        "application/octet-stream",
      );
    await finishChunkedUpload(storage, {
      storageKey: key,
      sizeBytes: bytes.length,
      contentType: "application/pdf",
    });
    assert.equal(digest((await storage.get(key))!), digest(bytes));
    const download = await fetch(
      await storage.createSignedDownloadUrl(key, "storage-test.pdf"),
      { signal: AbortSignal.timeout(30_000) },
    );
    assert.equal(download.status, 200);
    assert.equal(
      digest(Buffer.from(await download.arrayBuffer())),
      digest(bytes),
    );
    const unsigned = await fetch(
      `${configuration.client.endpoint}/${configuration.bucket}/${key}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    assert.ok(!unsigned.ok, "Unsigned S3 download must not succeed.");
    await unsigned.body?.cancel();
    await assert.rejects(
      storage.put(key, Buffer.from("different"), "application/pdf"),
    );
    verified = true;
  } finally {
    try {
      await storage.remove(key);
      for (let part = 0; part < 5; part++)
        await storage.remove(chunkKey(key, part));
      assert.equal(await storage.info(key), null);
    } finally {
      client.destroy();
    }
  }
  if (verified)
    console.log(
      "Live R2 verified: 10 MB server chunk upload, SHA-256 roundtrip, signed download, unsigned S3 refusal, immutable keys and complete probe cleanup. Verify bucket public-access settings separately.",
    );
}
main().catch(() => {
  console.error(
    "R2 certification failed. Check configuration/connectivity; no credentials or signed URLs printed.",
  );
  process.exitCode = 1;
});
