import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bareLoadReference, formatLoadReference } from "@/lib/load-reference";

describe("load reference (PO)", () => {
  it("strips the label a rate con prints in front of the number", () => {
    for (const raw of ["PO# 38525680", "PO#38525680", "PO 38525680", "P.O. 38525680", "P.O. No: 38525680", "Load #38525680", "Load # PO# 38525680", "#38525680", "Purchase Order: 38525680", "PO38525680", "  po #  38525680 "]) {
      assert.equal(bareLoadReference(raw), "38525680", raw);
    }
  });

  it("leaves real identifiers that only look like labels alone", () => {
    assert.equal(bareLoadReference("DAT-784"), "DAT-784");
    assert.equal(bareLoadReference("LOADSTAR-2"), "LOADSTAR-2");
    assert.equal(bareLoadReference("PAY-001"), "PAY-001");
    assert.equal(bareLoadReference("POD-77"), "POD-77");
  });

  it("is null when nothing is left", () => {
    assert.equal(bareLoadReference(null), null);
    assert.equal(bareLoadReference(""), null);
    assert.equal(bareLoadReference("  "), null);
    assert.equal(bareLoadReference("PO#"), null);
  });

  it("prints exactly one PO# prefix", () => {
    assert.equal(formatLoadReference("PO# 38525680"), "PO# 38525680");
    assert.equal(formatLoadReference("38525680"), "PO# 38525680");
    assert.equal(formatLoadReference(null), null);
  });
});
