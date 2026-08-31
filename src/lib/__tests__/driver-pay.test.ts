import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateDriverPay, driverSettlementTotals } from "../driver-pay";
import type { DriverSettlement } from "../types";

const load = { grossRate: 2400, loadedMiles: 784, deadheadMiles: 100 };

describe("driver pay formulas", () => {
  it("calculates every supported agreement from the same load facts", () => {
    assert.equal(calculateDriverPay("PERCENT_GROSS", 30, load), 720);
    assert.equal(calculateDriverPay("PER_LOADED_MILE", 0.6, load), 470.4);
    assert.equal(calculateDriverPay("PER_TOTAL_MILE", 0.6, load), 530.4);
    assert.equal(calculateDriverPay("FLAT_PER_LOAD", 425, load), 425);
  });

  it("sums frozen statement lines without re-deriving them", () => {
    const settlement = {
      lines: [
        { grossRevenue: 2400, totalMiles: 884, payAmount: 720 },
        { grossRevenue: 1800, totalMiles: 600, payAmount: 540 },
      ],
    } as DriverSettlement;
    assert.deepEqual(driverSettlementTotals(settlement), {
      loads: 2,
      grossRevenue: 4200,
      totalMiles: 1484,
      payAmount: 1260,
    });
  });
});
