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
      adjustments: [],
      lines: [
        { grossRevenue: 2400, totalMiles: 884, payAmount: 720 },
        { grossRevenue: 1800, totalMiles: 600, payAmount: 540 },
      ],
    } as unknown as DriverSettlement;
    assert.deepEqual(driverSettlementTotals(settlement), {
      loads: 2,
      grossRevenue: 4200,
      totalMiles: 1484,
      basePay: 1260,
      accessorialPay: 0,
      reimbursements: 0,
      otherEarnings: 0,
      deductions: 0,
      advances: 0,
      additions: 0,
      reductions: 0,
      netPay: 1260,
      payAmount: 1260,
      payPerLoad: 630,
      payPerMile: 0.85,
    });
  });

  it("turns operational adjustments into net pay without mixing their directions", () => {
    const settlement = {
      lines: [{ grossRevenue: 1000, totalMiles: 420, payAmount: 300 }],
      adjustments: [
        { type: "ACCESSORIAL_PAY", amount: 50 },
        { type: "REIMBURSEMENT", amount: 25 },
        { type: "DEDUCTION", amount: 20 },
        { type: "ADVANCE", amount: 100 },
      ],
    } as unknown as DriverSettlement;
    const totals = driverSettlementTotals(settlement);
    assert.equal(totals.basePay, 300);
    assert.equal(totals.additions, 75);
    assert.equal(totals.reductions, 120);
    assert.equal(totals.netPay, 255);
  });
});
