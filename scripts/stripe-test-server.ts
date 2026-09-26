import assert from "node:assert/strict";
import { createServer } from "node:http";
assert.equal(process.env.ONROAD_DISPOSABLE_DATABASE, "1");
assert.equal(new URL(process.env.NEON_DATABASE_URL!).hostname, "127.0.0.1");
const subscriptions = new Map<string, unknown>();
const server = createServer(async (request, response) => {
  if (request.url === "/ready") { response.end("ready"); return; }
  if (request.method === "POST" && request.url === "/fixture") {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const subscription = JSON.parse(Buffer.concat(chunks).toString());
    subscriptions.set(subscription.id, subscription);
    response.end("saved"); return;
  }
  const id = request.url?.split("?")[0].match(/^\/v1\/subscriptions\/([^/]+)$/)?.[1];
  const subscription = id && subscriptions.get(id);
  response.writeHead(subscription ? 200 : 404, { "Content-Type": "application/json" });
  response.end(JSON.stringify(subscription || { error: { message: "No fixture subscription", type: "invalid_request_error" } }));
});
server.listen(4576, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
