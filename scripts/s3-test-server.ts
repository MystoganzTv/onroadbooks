import { createServer } from "node:http";
import { S3TestFixture } from "./lib/s3-test-fixture";
const fixture = new S3TestFixture();
const server = createServer(async (request, response) => {
  const url = new URL(request.url!, "http://127.0.0.1:4575");
  if (url.pathname === "/ready") {
    response.end("fixture ready");
    return;
  }
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 11 * 1024 * 1024) throw new Error("fixture body limit");
      chunks.push(chunk);
    }
    const result = await fixture.handle({
      method: request.method!,
      path: url.pathname,
      headers: request.headers as Record<string, string>,
      query: Object.fromEntries(url.searchParams),
      body: Buffer.concat(chunks),
    });
    response.writeHead(result.response.statusCode, result.response.headers);
    result.response.body.pipe(response);
  } catch {
    response.writeHead(500);
    response.end();
  }
});
server.listen(4575, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
