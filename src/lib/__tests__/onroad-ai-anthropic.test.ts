import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AnthropicInterpreter } from "../onroad-ai/ai/anthropic";
import { INTERPRET_TOOL_NAME } from "../onroad-ai/ai/schema";

describe("Anthropic interpreter API contract", () => {
  it("uses a Sonnet-compatible forced tool request and normalizes the load", async () => {
    const provider = new AnthropicInterpreter({
      apiKey: "test-key",
      model: "claude-sonnet-5",
      inputCostPerMTok: 3,
      outputCostPerMTok: 15,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        // Non-default sampling parameters are rejected by Sonnet 5.
        for (const parameter of ["temperature", "top_p", "top_k"]) {
          assert.ok(!(parameter in body), parameter);
        }
        assert.deepEqual(body.tool_choice, { type: "tool", name: INTERPRET_TOOL_NAME });
        assert.equal(body.tools[0].name, INTERPRET_TOOL_NAME);
        assert.match(body.messages[0].content[0].text, /375 millas/);
        return Response.json({
          content: [{ type: "tool_use", name: INTERPRET_TOOL_NAME, input: {
            intent: "LOAD", language: "es", search: null,
            loads: [{ loadedMiles: 375, deadheadPickupMiles: 50, grossRate: 800 }],
          } }],
          usage: { input_tokens: 100, output_tokens: 50 },
        });
      },
    });

    const result = await provider.interpret(
      { kind: "text", text: "375 millas cargadas, 50 en vacío, pagan 800 dólares" },
      { currentLoad: null, today: "2026-10-27" },
    );
    assert.ok(result.ok);
    assert.equal(result.interpretation.loads[0].loadedMiles, 375);
    assert.equal(result.interpretation.loads[0].deadheadPickupMiles, 50);
    assert.equal(result.interpretation.loads[0].grossRate, 800);
    assert.equal(result.usage?.inputTokens, 100);
  });

  it("rejects free text instead of treating it as a load or driver reply", async () => {
    const provider = new AnthropicInterpreter({
      apiKey: "test-key", model: "claude-sonnet-5", inputCostPerMTok: 3, outputCostPerMTok: 15,
      fetchImpl: async () => Response.json({ content: [{ type: "text", text: "Take this load!" }] }),
    });
    const result = await provider.interpret(
      { kind: "text", text: "Read this load" }, { currentLoad: null, today: "2026-10-27" },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "UNREADABLE");
  });
});
