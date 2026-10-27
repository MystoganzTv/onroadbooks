import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { CaptureClient, runWebChat, webChatEnabledFor, webChatId } from "../onroad-ai/webchat";

/**
 * The web chat is the WhatsApp bot with a different delivery channel. These
 * tests drive the real router through runWebChat against the local memory
 * store (no AI key, so only the deterministic parser runs).
 */

describe("OnRoad AI web chat", () => {
  before(() => {
    process.env.ONROAD_AI_STORE = "memory";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  it("is off unless switched on, and only for platform admins", () => {
    const env = { ONROAD_AI_WEBCHAT: "true", PLATFORM_ADMIN_EMAILS: "Boss@Example.com" };
    assert.equal(webChatEnabledFor("boss@example.com", env), true);
    assert.equal(webChatEnabledFor("driver@example.com", env), false);
    assert.equal(webChatEnabledFor(null, env), false);
    assert.equal(webChatEnabledFor("boss@example.com", { ...env, ONROAD_AI_WEBCHAT: "1" }), false);
    assert.equal(webChatEnabledFor("boss@example.com", { PLATFORM_ADMIN_EMAILS: "boss@example.com" }), false);
  });

  it("keeps web identities apart from WhatsApp numbers", () => {
    assert.equal(webChatId("u1"), "web-u1");
    assert.doesNotMatch(webChatId("u1"), /^\d+$/);
  });

  it("captures what the bot would have sent and serves attached media", async () => {
    const capture = new CaptureClient();
    await capture.sendText("x", "hello");
    await capture.sendButtons("x", "pick", [{ id: "act:save", title: "Save" }]);
    assert.deepEqual(capture.replies, [
      { text: "hello", buttons: [] },
      { text: "pick", buttons: [{ id: "act:save", title: "Save" }] },
    ]);
    const id = capture.attach(Buffer.from("png"), "image/png");
    const got = await capture.downloadMedia(id, 10);
    assert.equal(got.ok, true);
    assert.deepEqual(await capture.downloadMedia(id, 1), { ok: false, reason: "TOO_LARGE" });
    assert.deepEqual(await capture.downloadMedia("missing", 10), { ok: false, reason: "NOT_FOUND" });
  });

  it("runs onboarding and a load analysis through the real router", async () => {
    const userId = `test-${Date.now()}`;
    const welcome = await runWebChat({ userId, displayName: null, text: "hola", replyId: null, file: null });
    assert.ok(welcome.length >= 1);
    const joined = welcome.map((reply) => reply.text).join("\n");
    assert.match(joined, /OnRoad AI/);

    await runWebChat({ userId, displayName: null, text: "saltar", replyId: null, file: null });
    const analysis = await runWebChat({
      userId,
      displayName: null,
      text: "Dallas TX Atlanta GA 780 millas $1650 45 DH",
      replyId: null,
      file: null,
    });
    const text = analysis.map((reply) => reply.text).join("\n");
    assert.match(text, /TOMAR|NEGOCIAR|PASAR/);
    assert.match(text, /\$1,650/);

    // History repeats the per-mile figure the analysis showed, not a re-rounded one.
    const history = (await runWebChat({ userId, displayName: null, text: "historial", replyId: null, file: null }))
      .map((reply) => reply.text)
      .join("\n");
    const perMile = history.match(/\$1,650 · (\$\d+\.\d\d)/)?.[1];
    assert.ok(perMile, history);
    assert.ok(text.includes(perMile), `${perMile} not in analysis`);
  });
});
