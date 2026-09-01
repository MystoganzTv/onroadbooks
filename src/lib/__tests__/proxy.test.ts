import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NextRequest } from "next/server";

import { proxy } from "../../proxy";

describe("network proxy boundary", () => {
  it("lets the monthly cron reach its own bearer-token check", () => {
    const response = proxy(
      new NextRequest("https://onroadbooks.com/api/cron/monthly-expenses", {
        headers: { Authorization: "Bearer certification-secret" },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
  });

  it("keeps every other private API behind an application session", async () => {
    const response = proxy(new NextRequest("https://onroadbooks.com/api/documents"));

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Not signed in." });
  });
});
