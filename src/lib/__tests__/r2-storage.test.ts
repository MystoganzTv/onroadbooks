import { it } from "node:test";
import assert from "node:assert/strict";
import { S3Client } from "@aws-sdk/client-s3";
import { R2DocumentStorage, r2Configuration } from "../storage/r2";
import { S3TestFixture } from "../../../scripts/lib/s3-test-fixture";
import {
  chunkKey,
  chunkSize,
  DOCUMENT_CHUNK_BYTES,
  finishChunkedUpload,
  readUploadPart,
} from "../storage/chunked-upload";
import { MAX_DOCUMENT_BYTES } from "../documents";
function fixture() {
  const wire = new S3TestFixture();
  const client = new S3Client({
    region: "auto",
    endpoint: "https://test.r2.cloudflarestorage.com",
    forcePathStyle: true,
    credentials: {
      accessKeyId: "fixture-access",
      secretAccessKey: "fixture-secret",
    },
    requestHandler: wire,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 1,
  });
  return { wire, client, storage: new R2DocumentStorage(client, "documents") };
}
it("R2 preserves bytes/metadata, signs private downloads and refuses overwrite or credential errors", async () => {
  const { storage, wire, client } = fixture();
  try {
    await storage.healthcheck();
    const data = Buffer.from("%PDF-private-fixture-ñ");
    const key = "load/existing-id/receipt.pdf";
    assert.equal(await storage.put(key, data, "application/pdf"), key);
    assert.deepEqual(await storage.get(key), data);
    assert.deepEqual(await storage.info(key), {
      sizeBytes: data.length,
      contentType: "application/pdf",
    });
    await storage.put(key, data, "application/pdf");
    await assert.rejects(
      storage.put(key, Buffer.from("different"), "application/pdf"),
      /different document/,
    );
    const signed = new URL(
      await storage.createSignedDownloadUrl(key, 'recibo ñ\r\n".pdf'),
    );
    assert.equal(signed.searchParams.get("X-Amz-Expires"), "60");
    assert.ok(signed.searchParams.get("X-Amz-Signature"));
    assert.equal(
      signed.searchParams.get("response-content-type"),
      "application/octet-stream",
    );
    assert.ok(
      !/[\r\n]/.test(signed.searchParams.get("response-content-disposition")!),
    );
    assert.ok(
      wire.requests.every((r) =>
        r.headers.authorization?.startsWith("AWS4-HMAC-SHA256"),
      ),
    );
    await storage.remove(key);
    assert.equal(await storage.get(key), null);
    assert.equal(await storage.info(key), null);
    await storage.remove(key);
    wire.denied = true;
    await assert.rejects(storage.info(key), /Could not verify/);
    await assert.rejects(storage.get(key), /Could not read/);
    await assert.rejects(
      storage.put(key, data, "application/pdf"),
      /Could not store/,
    );
    await assert.rejects(storage.healthcheck(), /unavailable/);
  } finally {
    client.destroy();
  }
});
it("server chunk assembly preserves a 10 MB document, handles retries and prevents replacement", async () => {
  const { storage, wire, client } = fixture();
  try {
    const bytes = Buffer.alloc(MAX_DOCUMENT_BYTES, 7);
    const upload = {
      storageKey: "expense/id/large.pdf",
      sizeBytes: bytes.length,
      contentType: "application/pdf",
    };
    await assert.rejects(finishChunkedUpload(storage, upload), /missing/);
    for (let part = 0; part < 5; part++)
      await storage.put(
        chunkKey(upload.storageKey, part),
        bytes.subarray(
          part * DOCUMENT_CHUNK_BYTES,
          (part + 1) * DOCUMENT_CHUNK_BYTES,
        ),
        "application/octet-stream",
      );
    await finishChunkedUpload(storage, upload);
    assert.deepEqual(await storage.get(upload.storageKey), bytes);
    assert.equal(wire.objects.size, 1);
    await finishChunkedUpload(storage, upload);
    await assert.rejects(
      finishChunkedUpload(storage, { ...upload, contentType: "image/png" }),
      /differs/,
    );
    await assert.rejects(
      storage.put(
        upload.storageKey,
        Buffer.alloc(bytes.length, 8),
        upload.contentType,
      ),
    );
  } finally {
    client.destroy();
  }
});
it("chunk reads enforce the signed limit even without Content-Length", async () => {
  const body = (bytes: Buffer) =>
    new Request("http://localhost/part", {
      method: "PUT",
      body: new Uint8Array(bytes),
    });
  assert.deepEqual(
    await readUploadPart(body(Buffer.from("ok")), 2),
    Buffer.from("ok"),
  );
  await assert.rejects(readUploadPart(body(Buffer.alloc(3)), 2), /exceeds/);
  await assert.rejects(readUploadPart(body(Buffer.alloc(1)), 2), /Incomplete/);
  for (const index of [-1, 5, 0.5, NaN])
    assert.throws(() => chunkSize(MAX_DOCUMENT_BYTES, index));
  assert.throws(() => chunkSize(MAX_DOCUMENT_BYTES + 1, 0));
});
it("R2 configuration fails closed and never accepts a public/custom endpoint", () => {
  assert.throws(() => r2Configuration({}), /must be configured/);
  const config = r2Configuration({
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET_NAME: "documents",
  });
  assert.equal(
    config.client.endpoint,
    `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
  );
});

it("disposable S3 endpoint refuses production and real credentials", () => {
  const env = {
    NODE_ENV: "development",
    ONROAD_DISPOSABLE_STORAGE: "1",
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "fixture-access",
    R2_SECRET_ACCESS_KEY: "fixture-secret",
    R2_BUCKET_NAME: "documents",
  };
  assert.equal(r2Configuration(env).client.endpoint, "http://127.0.0.1:4575");
  assert.throws(
    () => r2Configuration({ ...env, NODE_ENV: "production" }),
    /dummy credentials/,
  );
  assert.throws(
    () => r2Configuration({ ...env, VERCEL: "1" }),
    /dummy credentials/,
  );
  assert.throws(
    () => r2Configuration({ ...env, R2_SECRET_ACCESS_KEY: "real-secret" }),
    /dummy credentials/,
  );
});
