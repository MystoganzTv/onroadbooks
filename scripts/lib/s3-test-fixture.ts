import { createHash } from "node:crypto";
import { Readable } from "node:stream";

/** In-memory S3 protocol fixture, never a substitute for live R2 certification. */
export class S3TestFixture {
  readonly objects = new Map<string, { bytes: Buffer; type: string }>();
  readonly requests: Array<{
    method: string;
    path: string;
    headers: Record<string, string>;
  }> = [];
  denied = false;
  async handle(request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    query?: Record<string, unknown>;
    body?: unknown;
  }) {
    this.requests.push({
      method: request.method,
      path: request.path,
      headers: request.headers,
    });
    const reply = (
      statusCode: number,
      body: Buffer = Buffer.alloc(0),
      headers: Record<string, string> = {},
    ) => ({ response: { statusCode, headers, body: Readable.from([body]) } });
    if (
      this.denied ||
      (!request.headers.authorization && !request.query?.["X-Amz-Signature"])
    )
      return reply(403);
    const key = decodeURIComponent(request.path).replace(/^\/documents\/?/, "");
    if (request.method === "HEAD" && !key) return reply(200);
    const stored = this.objects.get(key);
    if (request.method === "PUT") {
      if (request.headers["if-none-match"] === "*" && stored) return reply(412);
      const bytes = Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.from(request.body as Uint8Array);
      if (
        request.headers["content-md5"] !==
        createHash("md5").update(bytes).digest("base64")
      )
        return reply(400);
      this.objects.set(key, {
        bytes: Buffer.from(bytes),
        type: request.headers["content-type"],
      });
      return reply(200, Buffer.alloc(0), { etag: '"fixture-etag"' });
    }
    if (request.method === "DELETE") {
      this.objects.delete(key);
      return reply(204);
    }
    if (!stored) return reply(404);
    const headers = {
      "content-length": String(stored.bytes.length),
      "content-type": String(
        request.query?.["response-content-type"] ?? stored.type,
      ),
      "cache-control": "private, no-store",
      ...(request.query?.["response-content-disposition"]
        ? {
            "content-disposition": String(
              request.query["response-content-disposition"],
            ),
          }
        : {}),
    };
    return reply(
      200,
      request.method === "HEAD" ? Buffer.alloc(0) : stored.bytes,
      headers,
    );
  }
}
