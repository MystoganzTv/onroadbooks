import "server-only";

import { createHash } from "node:crypto";
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MAX_DOCUMENT_BYTES } from "../documents";
import type { DocumentStorage } from "./contract";

export function r2Configuration(env: Record<string, string | undefined>) {
  const account = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET_NAME?.trim();
  if (
    !account ||
    !/^[a-f0-9]{32}$/i.test(account) ||
    !accessKeyId ||
    !secretAccessKey ||
    [accessKeyId, secretAccessKey].includes("[SENSITIVE]") ||
    !bucket ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)
  ) {
    throw new Error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME must be configured.",
    );
  }
  const localFixture = env.ONROAD_DISPOSABLE_STORAGE === "1";
  if (
    localFixture &&
    (env.VERCEL ||
      env.NODE_ENV !== "development" ||
      accessKeyId !== "fixture-access" ||
      secretAccessKey !== "fixture-secret" ||
      bucket !== "documents")
  ) {
    throw new Error(
      "The disposable storage fixture requires local development and dummy credentials.",
    );
  }
  return {
    bucket,
    client: {
      region: "auto",
      endpoint: localFixture
        ? "http://127.0.0.1:4575"
        : `https://${account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED" as const,
      responseChecksumValidation: "WHEN_REQUIRED" as const,
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
    },
  };
}

function status(error: unknown) {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
}
function validateKey(key: string) {
  if (
    !key ||
    Buffer.byteLength(key) > 1024 ||
    key.startsWith("/") ||
    /[\x00-\x1f\x7f\\]/.test(key) ||
    key.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid storage key.");
}

/** Private bucket; only the server holds credentials. Existing keys are immutable. */
export class R2DocumentStorage implements DocumentStorage {
  readonly chunkedUploads = true;
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async healthcheck() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      throw new Error("Private document storage is unavailable.");
    }
  }
  async put(key: string, data: Buffer, contentType: string) {
    validateKey(key);
    if (data.length === 0 || data.length > MAX_DOCUMENT_BYTES)
      throw new Error("Invalid document size.");
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
          ContentLength: data.length,
          ContentMD5: createHash("md5").update(data).digest("base64"),
          CacheControl: "private, no-store",
          IfNoneMatch: "*",
        }),
      );
    } catch (error) {
      // A retry may reuse a key only for exactly the same bytes and type.
      if (status(error) !== 412 && status(error) !== 409)
        throw new Error("Could not store the document.");
      const info = await this.info(key);
      if (
        info?.sizeBytes !== data.length ||
        info.contentType !== contentType ||
        !(await this.get(key))?.equals(data)
      ) {
        throw new Error(
          "The storage key already contains a different document.",
        );
      }
    }
    return key;
  }
  async get(key: string): Promise<Buffer | null> {
    validateKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) throw new Error();
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > MAX_DOCUMENT_BYTES) throw new Error();
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (status(error) === 404) return null;
      throw new Error("Could not read the stored document.");
    }
  }
  async remove(key: string) {
    validateKey(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      if (status(error) !== 404)
        throw new Error("Could not remove the stored document.");
    }
  }
  async info(key: string) {
    validateKey(key);
    try {
      const value = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        sizeBytes: value.ContentLength ?? 0,
        contentType: value.ContentType ?? null,
      };
    } catch (error) {
      if (status(error) === 404) return null;
      throw new Error("Could not verify the stored document.");
    }
  }
  async createSignedDownloadUrl(key: string, downloadName?: string) {
    validateKey(key);
    const name = downloadName?.replace(/[\x00-\x1f\x7f"\\]/g, "_");
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseCacheControl: "private, no-store",
          ...(name
            ? {
                ResponseContentType: "application/octet-stream",
                ResponseContentDisposition: `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
              }
            : {}),
        }),
        { expiresIn: 60 },
      );
    } catch {
      throw new Error("Could not authorize the document download.");
    }
  }
}
