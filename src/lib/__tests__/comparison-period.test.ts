import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pctChangeOrNull } from "@/lib/calculations";
import { comparisonPeriod, resolvePeriod } from "@/lib/periods";

const today = "2026-10-02";

describe("dashboard comparison period", () => {
  it("compares a quarter two days in with the first two days of the last one", () => {
    const prior = comparisonPeriod(resolvePeriod("2026-10", "quarter", { today }), today);
    assert.equal(prior.start, "2026-07-01");
    assert.equal(prior.end, "2026-07-02");
  });

  it("compares this year to date with last year to the same date", () => {
    const prior = comparisonPeriod(resolvePeriod("2026-10", "ytd", { today }), today);
    assert.equal(prior.start, "2025-01-01");
    assert.equal(prior.end, "2025-10-02");
  });

  it("keeps whole periods once they are over", () => {
    const prior = comparisonPeriod(resolvePeriod("2026-09", "quarter", { today }), today);
    assert.equal(prior.start, "2026-04-01");
    assert.equal(prior.end, "2026-06-30");
    const lastMonth = comparisonPeriod(resolvePeriod("2026-09", "full", { today }), today);
    assert.equal(lastMonth.end, "2026-08-31");
  });

  it("a running month compares with the same days of the previous month", () => {
    const prior = comparisonPeriod(resolvePeriod("2026-10", "full", { today }), today);
    assert.equal(prior.start, "2026-09-01");
    assert.equal(prior.end, "2026-09-02");
  });

  it("nothing to compare is null, not 0%", () => {
    assert.equal(pctChangeOrNull(2_566.62, 0), null);
    assert.equal(Math.round(pctChangeOrNull(110, 100)!), 10);
  });
});
