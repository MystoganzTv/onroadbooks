import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decimalSeparatorFor, odometerConcern, parseOdometerInput } from "../odometer";

describe("parseOdometerInput", () => {
  it("accepts plain whole numbers", () => {
    assert.deepEqual(parseOdometerInput("271184", "."), { kind: "ok", value: 271184 });
    assert.deepEqual(parseOdometerInput(" 0 ", "."), { kind: "ok", value: 0 });
    assert.deepEqual(parseOdometerInput("", "."), { kind: "empty" });
  });

  it("flags the thousands-typed-as-decimal typo instead of saving 271 miles", () => {
    assert.deepEqual(parseOdometerInput("271.184", "."), { kind: "suspect", value: 271184 });
    assert.deepEqual(parseOdometerInput("271,184", ","), { kind: "suspect", value: 271184 });
  });

  it("accepts the locale's own thousands grouping", () => {
    assert.deepEqual(parseOdometerInput("271,184", "."), { kind: "ok", value: 271184 });
    assert.deepEqual(parseOdometerInput("271.184", ","), { kind: "ok", value: 271184 });
    assert.deepEqual(parseOdometerInput("1.271.184", "."), { kind: "ok", value: 1271184 });
  });

  it("offers a rounded whole mile for fractional readings", () => {
    assert.deepEqual(parseOdometerInput("271184.6", "."), { kind: "suspect", value: 271185 });
    assert.deepEqual(parseOdometerInput("271184,5", ","), { kind: "suspect", value: 271185 });
  });

  it("rejects anything else", () => {
    for (const text of ["abc", "-5", "271.18.4", "27,1184", "1e6", "99999999"]) {
      assert.equal(parseOdometerInput(text, ".").kind, "invalid", text);
    }
  });
});

describe("odometerConcern", () => {
  it("flags readings below the last one", () => {
    assert.deepEqual(odometerConcern(271, 270_500), { kind: "below", reference: 270_500 });
  });
  it("flags implausible jumps", () => {
    assert.deepEqual(odometerConcern(2_711_840, 270_500), { kind: "jump", reference: 270_500, miles: 2_441_340 });
  });
  it("passes normal readings and missing references", () => {
    assert.equal(odometerConcern(271_184, 270_500), null);
    assert.equal(odometerConcern(270_500, 270_500), null);
    assert.equal(odometerConcern(5, null), null);
  });
});

describe("decimalSeparatorFor", () => {
  it("follows the locale", () => {
    assert.equal(decimalSeparatorFor("en-US"), ".");
    assert.equal(decimalSeparatorFor("es-ES"), ",");
  });
});
