import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isDeadheadElevated,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "../calculations";
import { defaultCategoryBehavior } from "../categories";
import {
  calculateTrueCostPerMile,
  overheadCostPerMile,
  trailingCostBasis,
} from "../finance/cost-per-mile";
import { calculateSafeOwnerPay, resolveReserveRules } from "../finance/owner-pay";
import { calculateLoadScore, scoreLoads, bestAndWorst } from "../finance/load-score";
import { calculateLoadEstimate, calculateTargetRate } from "../finance/load-calculator";
import { calculateDeadheadCost } from "../finance/deadhead";
import { calculateLanePerformance } from "../finance/lanes";
import { calculateBrokerPerformance, sortBrokers } from "../finance/brokers";
import {
  calculateDaySnapshot,
  calculateGoalProgress,
  calculateProjection,
  dailyProfitTarget,
  isWorkingDay,
  monthlyTargetShare,
  workingDaysIn,
} from "../finance/goals";
import { calculateReserveBalances } from "../finance/reserves";
import {
  buildSettlementSnapshot,
  settlementBounds,
  selectSettlementView,
  settlementWindows,
} from "../finance/settlement";
import { buildCockpitInsights } from "../finance/insights";
import { calculateMaintenanceHealth } from "../finance/maintenance-health";
import { calculateCashActivity } from "../finance/cash-activity";
import { calculateFinancialPlanning } from "../finance/planning";
import { resolvePeriod } from "../periods";
import type {
  Expense,
  FinancialGoal,
  FinancialObligation,
  FinancialSettings,
  Load,
  MaintenanceRecord,
  ReserveAccount,
  ReserveTransaction,
  Truck,
} from "../types";

/* ---- Fixtures ---------------------------------------------------------- */

const settings: FinancialSettings = {
  id: "s",
  businessId: "b",
  taxReservePct: 20,
  maintenanceReservePct: 5,
  categoryBehavior: defaultCategoryBehavior(),
  ratingGreatPerMile: 2,
  ratingGoodPerMile: 1.5,
  ratingMarginalPerMile: 1,
  deadheadWarnPct: 20,
  maintenanceWarnMiles: 2000,
  maintenanceWarnDays: 30,
  iftaTaxRates: {},
  updatedAt: "",
};

const goals: FinancialGoal = {
  id: "g",
  businessId: "b",
  monthlyRevenueTarget: 15000,
  monthlyProfitTarget: 7500,
  targetProfitPerMile: 1.5,
  maxDeadheadPct: 15,
  targetLoads: 30,
  workingDaysPerWeek: 6,
  updatedAt: "",
};

const accounts: ReserveAccount[] = [
  {
    id: "res_tax",
    businessId: "b",
    kind: "TAX",
    name: "Tax Reserve",
    basis: "OPERATING_PROFIT",
    contributionPct: null,
    targetBalance: null,
    active: true,
    sortOrder: 0,
    createdAt: "",
  },
  {
    id: "res_maintenance",
    businessId: "b",
    kind: "MAINTENANCE",
    name: "Maintenance Reserve",
    basis: "GROSS_REVENUE",
    contributionPct: null,
    targetBalance: 6000,
    active: true,
    sortOrder: 1,
    createdAt: "",
  },
  {
    id: "res_em",
    businessId: "b",
    kind: "EMERGENCY",
    name: "Emergency Fund",
    basis: "GROSS_REVENUE",
    contributionPct: 2,
    targetBalance: null,
    active: true,
    sortOrder: 2,
    createdAt: "",
  },
];

function load(over: Partial<Load> = {}): Load {
  return {
    id: "l",
    businessId: "b",
    truckId: "t",
    driverId: null,
    date: "2026-08-05",
    deliveryDate: null,
    endingOdometer: null,
    equipmentType: null,
    loadCapacity: null,
    equipmentLengthFt: null,
    weightLbs: null,
    commodity: null,
    originCity: "Richmond",
    originState: "VA",
    destinationCity: "Baltimore",
    destinationState: "MD",
    broker: "Acme",
    loadNumber: null,
    loadedMiles: 100,
    deadheadMiles: 0,
    grossRate: 500,
    fuelCost: 0,
    tolls: 0,
    dispatchFee: 0,
    factoringFee: 0,
    otherExpenses: 0,
    driverPay: 0,
    costsPosted: false,
    status: "PAID",
    jurisdictionMiles: [],
    invoiceNumber: null,
    invoiceDate: null,
    invoiceDueDate: null,
    invoicePaidDate: null,
    billToName: null,
    billToEmail: null,
    billToAddress: null,
    invoiceNotes: null,
    notes: null,
    createdAt: "",
    ...over,
  };
}

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e",
    businessId: "b",
    truckId: "t",
    scope: "TRUCK",
    loadId: null,
    date: "2026-08-05",
    category: "FUEL",
    description: "x",
    vendor: null,
    amount: 100,
    recurring: false,
    receiptNumber: null,
    notes: null,
    createdAt: "",
    ...over,
  };
}

const thresholds = thresholdsFromSettings(settings);
const august = resolvePeriod("2026-08", "full");
const firstHalf = resolvePeriod("2026-08", "first");
const secondHalf = resolvePeriod("2026-08", "second");

/* ---- True cost per mile ------------------------------------------------ */

describe("calculateTrueCostPerMile", () => {
  const loads = [
    load({ id: "a", date: "2026-08-03", loadedMiles: 400, deadheadMiles: 100 }),
    load({ id: "b", date: "2026-08-20", loadedMiles: 400, deadheadMiles: 100 }),
  ];
  const expenses = [
    // The truck note lands on the 1st, entirely inside the first half.
    expense({ id: "note", date: "2026-08-01", category: "TRUCK_PAYMENT", amount: 1200 }),
    expense({ id: "f1", date: "2026-08-03", category: "FUEL", amount: 300 }),
    expense({ id: "f2", date: "2026-08-20", category: "FUEL", amount: 300 }),
  ];

  it("divides actual operating expenses by actual miles and reports debt separately", () => {
    const cost = calculateTrueCostPerMile(loads, expenses, august, settings, "August");
    assert.equal(cost.totalMiles, 1000);
    assert.equal(cost.totalCost, 600);
    assert.equal(cost.debtServiceTotal, 1200);
    assert.equal(cost.cashCostTotal, 1800);
    assert.equal(cost.actualCostPerMile, 0.6);
    assert.equal(cost.debtServicePerMile, 1.2);
    assert.equal(cost.cashCostPerMile, 1.8);
  });

  it("splits fixed and variable, and the two add up to the whole", () => {
    const cost = calculateTrueCostPerMile(loads, expenses, august, settings, "August");
    assert.equal(cost.fixedTotal, 0);
    assert.equal(cost.variableTotal, 600);
    assert.equal(
      Math.round((cost.fixedCostPerMile + cost.variableCostPerMile) * 1000) / 1000,
      cost.trueCostPerMile,
    );
  });

  it("does NOT prorate a monthly cost across the halves", () => {
    const a = calculateTrueCostPerMile(loads, expenses, firstHalf, settings, "1-15");
    const b = calculateTrueCostPerMile(loads, expenses, secondHalf, settings, "16-end");
    // Operating cost is comparable; the debt cash burden stays on the day paid.
    assert.equal(a.totalCost, 300);
    assert.equal(b.totalCost, 300);
    assert.equal(a.trueCostPerMile, 0.6);
    assert.equal(b.trueCostPerMile, 0.6);
    assert.equal(a.debtServiceTotal, 1200);
    assert.equal(b.debtServiceTotal, 0);
    assert.ok(a.cashCostPerMile > b.cashCostPerMile);
  });

  it("the halves' costs and miles still sum to the whole month", () => {
    const a = calculateTrueCostPerMile(loads, expenses, firstHalf, settings, "a");
    const b = calculateTrueCostPerMile(loads, expenses, secondHalf, settings, "b");
    const full = calculateTrueCostPerMile(loads, expenses, august, settings, "full");
    assert.equal(a.totalCost + b.totalCost, full.totalCost);
    assert.equal(a.totalMiles + b.totalMiles, full.totalMiles);
  });

  it("reports insufficient rather than a cost of zero when there are no miles", () => {
    const cost = calculateTrueCostPerMile([], expenses, august, settings, "August");
    assert.equal(cost.sufficient, false);
    assert.equal(cost.trueCostPerMile, 0);
    assert.equal(cost.lines.length, 0);
  });

  it("counts deadhead miles in the denominator", () => {
    const clean = calculateTrueCostPerMile(
      [load({ loadedMiles: 1000, deadheadMiles: 0 })],
      [expense({ amount: 1000 })],
      august,
      settings,
      "x",
    );
    const empty = calculateTrueCostPerMile(
      [load({ loadedMiles: 500, deadheadMiles: 500 })],
      [expense({ amount: 1000 })],
      august,
      settings,
      "x",
    );
    assert.equal(clean.trueCostPerMile, empty.trueCostPerMile);
  });
});

describe("overheadCostPerMile", () => {
  it("removes the categories the calculator asks for directly", () => {
    const cost = calculateTrueCostPerMile(
      [load({ loadedMiles: 900, deadheadMiles: 100 })],
      [
        expense({ id: "1", category: "FUEL", amount: 500 }),
        expense({ id: "2", category: "TOLLS", amount: 100 }),
        expense({ id: "3", category: "DISPATCH", amount: 100 }),
        expense({ id: "4", category: "FACTORING", amount: 100 }),
        expense({ id: "5", category: "INSURANCE", amount: 1200 }),
        expense({ id: "6", category: "TRUCK_PAYMENT", amount: 900 }),
      ],
      august,
      settings,
      "x",
    );
    assert.equal(cost.trueCostPerMile, 2);
    assert.equal(cost.debtServicePerMile, 0.9);
    // Only operating insurance survives the direct-trip exclusions.
    assert.equal(overheadCostPerMile(cost), 1.2);
  });

  it("also removes a load's auto-posted Other row, even though it books under OTHER", () => {
    const cost = calculateTrueCostPerMile(
      [load({ loadedMiles: 900, deadheadMiles: 100 })],
      [
        // The row reconcileLoadExpenseLedger posts for a load's otherExpenses.
        expense({ id: "expload_l1_other", category: "OTHER", amount: 120, loadId: "l1" }),
        // A manual OTHER expense with no load behind it stays in the overhead.
        expense({ id: "manual", category: "OTHER", amount: 80 }),
        expense({ id: "note", category: "TRUCK_PAYMENT", amount: 800 }),
      ],
      august,
      settings,
      "x",
    );
    // The calculator asks for trip Other costs explicitly, and financing is
    // separate: only the manual $80 remains in allocated operating cost.
    assert.equal(cost.directTripTotal, 120);
    assert.equal(cost.debtServiceTotal, 800);
    assert.equal(overheadCostPerMile(cost), 0.08);
  });

  it("is zero, not negative, when there is no basis", () => {
    const cost = calculateTrueCostPerMile([], [], august, settings, "x");
    assert.equal(overheadCostPerMile(cost), 0);
  });
});

describe("trailingCostBasis", () => {
  it("falls back to all history when the recent window is too thin", () => {
    const old = [load({ id: "o", date: "2025-01-05", loadedMiles: 2000, deadheadMiles: 0 })];
    const oldExpenses = [expense({ id: "oe", date: "2025-01-05", amount: 2000 })];
    const basis = trailingCostBasis(old, oldExpenses, settings, "2026-08-29");
    assert.equal(basis.basisLabel, "All recorded history");
    assert.equal(basis.trueCostPerMile, 1);
  });

  it("says so plainly when there is nothing at all", () => {
    const basis = trailingCostBasis([], [], settings, "2026-08-29");
    assert.equal(basis.sufficient, false);
    assert.equal(basis.basisLabel, "No data yet");
  });
});

/* ---- Safe to pay yourself ---------------------------------------------- */

describe("resolveReserveRules", () => {
  it("reads built-in rates from settings and custom rates from the bucket", () => {
    const rules = resolveReserveRules(settings, accounts);
    assert.deepEqual(
      rules.map((r) => [r.kind, r.pct]),
      [
        ["TAX", 20],
        ["MAINTENANCE", 5],
        ["EMERGENCY", 2],
      ],
    );
  });

  it("skips inactive buckets", () => {
    const rules = resolveReserveRules(settings, [
      ...accounts.slice(0, 2),
      { ...accounts[2], active: false },
    ]);
    assert.equal(rules.length, 2);
  });
});

describe("calculateSafeOwnerPay", () => {
  const ownerPayInput = ({
    bookedRevenue,
    collectedRevenue = bookedRevenue,
    operatingExpenses,
    interestExpense = 0,
    principalPayment = 0,
    unallocatedDebtService = 0,
  }: {
    bookedRevenue: number;
    collectedRevenue?: number;
    operatingExpenses: number;
    interestExpense?: number;
    principalPayment?: number;
    unallocatedDebtService?: number;
  }) => {
    const operatingProfit = bookedRevenue - operatingExpenses;
    const debtService = interestExpense + principalPayment + unallocatedDebtService;
    return {
      calculationVersion: 2,
      bookedRevenue,
      collectedRevenue,
      accountsReceivable: Math.max(bookedRevenue - collectedRevenue, 0),
      unallocatedCollectedRevenue: 0,
      operatingExpenses,
      operatingProfit,
      interestExpense,
      principalPayment,
      unallocatedDebtService,
      debtService,
      cashAfterDebtService: collectedRevenue - operatingExpenses - debtService,
    };
  };

  it("walks revenue down to what is free to take", () => {
    const pay = calculateSafeOwnerPay(
      ownerPayInput({ bookedRevenue: 8420, operatingExpenses: 1578 }),
      resolveReserveRules(settings, accounts.slice(0, 2)),
    );
    assert.equal(pay.operatingProfit, 6842);
    assert.equal(pay.reserves[0].amount, 1368.4); // 20% of operating profit
    assert.equal(pay.reserves[1].amount, 421); // 5% of Booked Revenue
    assert.equal(pay.reserveTotal, 1789.4);
    assert.equal(pay.safeToPay, 5052.6);
  });

  it("charges no tax reserve on a loss, but still reserves against revenue", () => {
    const pay = calculateSafeOwnerPay(
      ownerPayInput({ bookedRevenue: 1000, operatingExpenses: 3000 }),
      resolveReserveRules(settings, accounts),
    );
    assert.equal(pay.operatingProfit, -2000);
    assert.equal(pay.reserves.find((r) => r.kind === "TAX")!.amount, 0);
    assert.equal(pay.reserves.find((r) => r.kind === "MAINTENANCE")!.amount, 50);
    assert.equal(pay.safeToPay, -2070);
  });

  it("reserves and safe-to-pay always reconstruct cash after debt service", () => {
    const pay = calculateSafeOwnerPay(
      ownerPayInput({
        bookedRevenue: 12345.67,
        collectedRevenue: 11345.67,
        operatingExpenses: 4321.09,
        interestExpense: 200,
        principalPayment: 600,
      }),
      resolveReserveRules(settings, accounts),
    );
    const sum = pay.reserves.reduce((total, r) => total + r.amount, 0) + pay.safeToPay;
    assert.ok(Math.abs(sum - pay.cashAfterDebtService) < 0.02);
  });

  it("reconciles the reviewed two-load example after trip costs reach the ledger", () => {
    const pay = calculateSafeOwnerPay(
      ownerPayInput({ bookedRevenue: 4800, operatingExpenses: 2734 }),
      resolveReserveRules(
        { ...settings, taxReservePct: 20, maintenanceReservePct: 10 },
        accounts.slice(0, 2),
      ),
    );

    assert.equal(pay.operatingProfit, 2066);
    assert.equal(pay.reserves.find((reserve) => reserve.kind === "TAX")?.amount, 413.2);
    assert.equal(pay.reserves.find((reserve) => reserve.kind === "MAINTENANCE")?.amount, 480);
    assert.equal(pay.safeToPay, 1172.8);
  });

  it("never treats an unpaid invoice as cash available to the owner", () => {
    const pay = calculateSafeOwnerPay(
      ownerPayInput({ bookedRevenue: 2500, collectedRevenue: 0, operatingExpenses: 0 }),
      resolveReserveRules(settings, accounts.slice(0, 2)),
    );

    assert.equal(pay.operatingProfit, 2500);
    assert.equal(pay.accountsReceivable, 2500);
    assert.equal(pay.cashAfterDebtService, 0);
    assert.equal(pay.safeToPay, -625);
  });
});

/* ---- Load score --------------------------------------------------------- */

describe("calculateLoadScore", () => {
  it("stays inside 0-100 at both extremes", () => {
    const high = calculateLoadScore(
      { profitPerMile: 99, profitMargin: 99, deadheadPct: 0 },
      thresholds,
      20,
    );
    const low = calculateLoadScore(
      { profitPerMile: -20, profitMargin: -300, deadheadPct: 95 },
      thresholds,
      20,
    );
    assert.equal(high.score, 100);
    assert.equal(low.score, 0);
  });

  it("never disagrees with the rating about which load is better", () => {
    const better = calculateLoadScore(
      { profitPerMile: 2.4, profitMargin: 55, deadheadPct: 8 },
      thresholds,
      20,
    );
    const worse = calculateLoadScore(
      { profitPerMile: 0.6, profitMargin: 18, deadheadPct: 32 },
      thresholds,
      20,
    );
    assert.ok(better.score > worse.score);
    assert.equal(better.rating, "GREAT");
    assert.equal(worse.rating, "BAD");
  });

  it("shows its working: components never exceed their weights", () => {
    const score = calculateLoadScore(
      { profitPerMile: 2.34, profitMargin: 58, deadheadPct: 8 },
      thresholds,
      20,
    );
    assert.equal(score.components.length, 3);
    for (const component of score.components) {
      assert.ok(component.points >= 0 && component.points <= component.max);
    }
    const total = score.components.reduce((n, c) => n + c.points, 0);
    // Rounded once from the unrounded total, so at most a point of drift.
    assert.ok(Math.abs(total - score.score) <= 2);
  });

  it("punishes deadhead even when the rate is strong", () => {
    const clean = calculateLoadScore(
      { profitPerMile: 2, profitMargin: 50, deadheadPct: 0 },
      thresholds,
      20,
    );
    const empty = calculateLoadScore(
      { profitPerMile: 2, profitMargin: 50, deadheadPct: 30 },
      thresholds,
      20,
    );
    assert.ok(clean.score > empty.score);
  });

  it("honours a zero deadhead warning instead of falling back to 20%", () => {
    const clean = calculateLoadScore(
      { profitPerMile: 2, profitMargin: 50, deadheadPct: 0 },
      thresholds,
      0,
    );
    const anyDeadhead = calculateLoadScore(
      { profitPerMile: 2, profitMargin: 50, deadheadPct: 0.1 },
      thresholds,
      0,
    );
    assert.equal(clean.components.find((part) => part.key === "deadhead")?.points, 20);
    assert.equal(anyDeadhead.components.find((part) => part.key === "deadhead")?.points, 0);
  });
});

describe("bestAndWorst", () => {
  it("does not invent a worst load when there is only one", () => {
    const scored = scoreLoads(withMetricsAll([load()], thresholds), thresholds, 20);
    const { best, worst } = bestAndWorst(scored);
    assert.ok(best);
    assert.equal(worst, undefined);
  });
});

/* ---- Load calculator ---------------------------------------------------- */

describe("calculateLoadEstimate", () => {
  const base = {
    grossRate: 700,
    loadedMiles: 407,
    deadheadMiles: 84,
    fuelPrice: 3.78,
    mpg: 9.2,
    tolls: 38,
    dispatchMode: "PCT" as const,
    dispatchValue: 0,
    factoringMode: "PCT" as const,
    factoringValue: 0,
    otherCost: 0,
    overheadPerMile: 0.25,
    debtServicePerMile: 1.75,
  };

  it("always includes deadhead in the miles it prices", () => {
    const estimate = calculateLoadEstimate(base, thresholds, 20);
    assert.equal(estimate.totalMiles, 491);
    assert.equal(estimate.gallons, 491 / 9.2);
    assert.ok(Math.abs(estimate.fuelCost - (491 / 9.2) * 3.78) < 0.01);
  });

  it("gross per loaded mile and per total mile differ once there is deadhead", () => {
    const estimate = calculateLoadEstimate(base, thresholds, 20);
    assert.ok(estimate.grossPerLoadedMile > estimate.grossPerTotalMile);
  });

  it("every dollar is accounted for: gross - costs = profit", () => {
    const estimate = calculateLoadEstimate(
      { ...base, dispatchValue: 5, factoringMode: "AMOUNT", factoringValue: 20, otherCost: 15 },
      thresholds,
      20,
    );
    const costs =
      estimate.fuelCost +
      estimate.tolls +
      estimate.dispatch +
      estimate.factoring +
      estimate.otherCost +
      estimate.overhead;
    assert.ok(Math.abs(costs - estimate.totalCost) < 0.01);
    assert.ok(Math.abs(700 - estimate.totalCost - estimate.profit) < 0.01);
    assert.ok(
      Math.abs(estimate.profit - estimate.debtService - estimate.cashAfterDebtService) < 0.01,
    );
  });

  it("classifies on contribution profit, never allocated costs or debt service", () => {
    const lowDebt = calculateLoadEstimate({ ...base, debtServicePerMile: 0 }, thresholds, 20);
    const highDebt = calculateLoadEstimate({ ...base, debtServicePerMile: 10 }, thresholds, 20);
    const highOperatingCost = calculateLoadEstimate(
      { ...base, overheadPerMile: 10, debtServicePerMile: 0 },
      thresholds,
      20,
    );

    assert.equal(lowDebt.score.rating, highDebt.score.rating);
    assert.equal(lowDebt.score.rating, highOperatingCost.score.rating);
    assert.equal(lowDebt.score.score, highDebt.score.score);
    assert.equal(lowDebt.score.score, highOperatingCost.score.score);
    assert.ok(highDebt.cashAfterDebtService < lowDebt.cashAfterDebtService);
    assert.ok(highOperatingCost.fullyLoadedOperatingProfit < lowDebt.fullyLoadedOperatingProfit);
  });

  it("treats a percentage fee and the same money as a flat fee identically", () => {
    const pct = calculateLoadEstimate({ ...base, dispatchValue: 10 }, thresholds, 20);
    const flat = calculateLoadEstimate(
      { ...base, dispatchMode: "AMOUNT", dispatchValue: 70 },
      thresholds,
      20,
    );
    assert.equal(pct.dispatch, 70);
    assert.equal(pct.profit, flat.profit);
  });

  it("refuses to pretend without miles or MPG", () => {
    assert.equal(calculateLoadEstimate({ ...base, mpg: 0 }, thresholds, 20).valid, false);
    assert.equal(
      calculateLoadEstimate({ ...base, loadedMiles: 0, deadheadMiles: 0 }, thresholds, 20).valid,
      false,
    );
  });

  it("does not blow up on zero miles", () => {
    const estimate = calculateLoadEstimate(
      { ...base, loadedMiles: 0, deadheadMiles: 0 },
      thresholds,
      20,
    );
    assert.equal(estimate.profitPerMile, 0);
    assert.ok(Number.isFinite(estimate.profitMargin));
  });
});

describe("calculateTargetRate", () => {
  const base = {
    loadedMiles: 400,
    deadheadMiles: 100,
    fuelPrice: 4,
    mpg: 10,
    tolls: 40,
    dispatchMode: "PCT" as const,
    dispatchValue: 5,
    factoringMode: "PCT" as const,
    factoringValue: 2.5,
    otherCost: 0,
    overheadPerMile: 0.5,
    debtServicePerMile: 0.3,
    targetProfitPerMile: 1.5,
  };

  it("solves for a rate that really does clear the target after the fees", () => {
    const target = calculateTargetRate(base, thresholds);
    const tier = target.tiers.find((t) => t.key === "target")!;
    const fees = tier.rate * 0.075;
    const profit = tier.rate - fees - target.fixedTripCost;
    assert.ok(Math.abs(profit / target.totalMiles - 1.5) < 0.01);
  });

  it("break even really is zero profit", () => {
    const target = calculateTargetRate(base, thresholds);
    const tier = target.tiers.find((t) => t.key === "operatingBreakeven")!;
    const profit = tier.rate - tier.rate * 0.075 - target.fixedTripCost;
    assert.ok(Math.abs(profit) < 0.02);
  });

  it("ranks the tiers in the order a driver would expect", () => {
    const rates = calculateTargetRate(base, thresholds).tiers;
    const by = (key: string) => rates.find((t) => t.key === key)!.rate;
    assert.ok(by("operatingBreakeven") < by("cashBreakeven"));
    assert.ok(by("cashBreakeven") < by("minimum"));
    assert.ok(by("minimum") < by("good"));
    assert.ok(by("good") < by("great"));
  });

  it("refuses when the fees swallow the whole rate", () => {
    const target = calculateTargetRate({ ...base, dispatchValue: 70, factoringValue: 40 }, thresholds);
    assert.equal(target.impossible, true);
    assert.equal(target.valid, false);
  });

  it("prices deadhead into the quote", () => {
    const withEmpty = calculateTargetRate(base, thresholds);
    const without = calculateTargetRate({ ...base, deadheadMiles: 0 }, thresholds);
    const rate = (t: ReturnType<typeof calculateTargetRate>) =>
      t.tiers.find((x) => x.key === "target")!.rate;
    assert.ok(rate(withEmpty) > rate(without));
  });
});

/* ---- Deadhead ----------------------------------------------------------- */

describe("calculateDeadheadCost", () => {
  const loads = [load({ loadedMiles: 4220, deadheadMiles: 782, grossRate: 12000 })];
  const summary = summarizePeriod(loads, [expense({ amount: 5000 })], august, settings);

  it("prices empty miles at the truck's true cost per mile", () => {
    const report = calculateDeadheadCost(
      summary,
      { trueCostPerMile: 1.13, sufficient: true },
      settings,
      15,
    );
    assert.equal(report.deadheadMiles, 782);
    assert.equal(report.cost, 883.66);
  });

  it("uses the configured warning percentage everywhere", () => {
    assert.equal(isDeadheadElevated(15.6, 20), false);
    assert.equal(isDeadheadElevated(15.6, 10), true);

    const report = calculateDeadheadCost(
      summary,
      { trueCostPerMile: 1, sufficient: true },
      { deadheadWarnPct: 10 },
      null,
    );
    assert.equal(report.warnPct, 10);
    assert.equal(report.elevated, true);
  });

  it("reports zero cost rather than a guess when there is no cost basis", () => {
    const report = calculateDeadheadCost(
      summary,
      { trueCostPerMile: 0, sufficient: false },
      settings,
      null,
    );
    assert.equal(report.cost, 0);
    assert.equal(report.goalPct, null);
  });

  it("says how many miles would bring it back under the ceiling", () => {
    const report = calculateDeadheadCost(
      summary,
      { trueCostPerMile: 1, sufficient: true },
      settings,
      10,
    );
    assert.ok(report.milesToGoal > 0);
    assert.ok(report.milesToGoal < report.deadheadMiles);
  });

  it("stays calm when every mile was loaded", () => {
    const clean = summarizePeriod(
      [load({ loadedMiles: 500, deadheadMiles: 0 })],
      [],
      august,
      settings,
    );
    const report = calculateDeadheadCost(
      clean,
      { trueCostPerMile: 1, sufficient: true },
      settings,
      15,
    );
    assert.equal(report.cost, 0);
    assert.match(report.statement, /under a load/);
  });
});

/* ---- Lanes and brokers --------------------------------------------------- */

describe("calculateLanePerformance", () => {
  const loads = withMetricsAll(
    [
      load({ id: "1", originState: "VA", destinationState: "NJ", grossRate: 1200, loadedMiles: 300 }),
      load({ id: "2", originState: "VA", destinationState: "NJ", grossRate: 1200, loadedMiles: 300 }),
      load({ id: "3", originState: "VA", destinationState: "NJ", grossRate: 1200, loadedMiles: 300 }),
      load({ id: "4", originState: "NJ", destinationState: "VA", grossRate: 400, loadedMiles: 300 }),
      load({ id: "5", originState: "NJ", destinationState: "VA", grossRate: 400, loadedMiles: 300 }),
    ],
    thresholds,
  );

  it("treats each direction as its own lane", () => {
    const lanes = calculateLanePerformance(loads, thresholds);
    const out = lanes.find((l) => l.key === "VA>NJ")!;
    const back = lanes.find((l) => l.key === "NJ>VA")!;
    assert.equal(out.loadCount, 3);
    assert.equal(back.loadCount, 2);
    assert.ok(out.profitPerMile > back.profitPerMile);
  });

  it("does not rank a lane until it has enough loads", () => {
    const lanes = calculateLanePerformance(loads, thresholds);
    assert.equal(lanes.find((l) => l.key === "VA>NJ")!.qualified, true);
    assert.equal(lanes.find((l) => l.key === "NJ>VA")!.qualified, false);
  });

  it("normalises state casing so va and VA are one lane", () => {
    const mixed = withMetricsAll(
      [
        load({ id: "a", originState: "va", destinationState: "nj" }),
        load({ id: "b", originState: "VA", destinationState: "NJ" }),
      ],
      thresholds,
    );
    assert.equal(calculateLanePerformance(mixed, thresholds).length, 1);
  });
});

describe("calculateBrokerPerformance", () => {
  const loads = withMetricsAll(
    [
      // High volume, thin per mile.
      load({ id: "1", broker: "Volume Co", grossRate: 2000, loadedMiles: 1000, fuelCost: 1200 }),
      load({ id: "2", broker: "Volume Co", grossRate: 2000, loadedMiles: 1000, fuelCost: 1200 }),
      // Low volume, strong per mile.
      load({ id: "3", broker: "Sharp LLC", grossRate: 900, loadedMiles: 200, fuelCost: 100 }),
      load({ id: "4", broker: "Sharp LLC", grossRate: 900, loadedMiles: 200, fuelCost: 100 }),
    ],
    thresholds,
  );

  it("keeps volume and quality as separate axes", () => {
    const brokers = calculateBrokerPerformance(loads, thresholds);
    const byProfit = sortBrokers(brokers, "profit")[0];
    const byMile = sortBrokers(brokers, "profitPerMile")[0];
    assert.equal(byProfit.broker, "Volume Co");
    assert.equal(byMile.broker, "Sharp LLC");
  });

  it("reports a margin and a per-load average for each", () => {
    const sharp = calculateBrokerPerformance(loads, thresholds).find(
      (b) => b.broker === "Sharp LLC",
    )!;
    assert.equal(sharp.averageRevenuePerLoad, 900);
    assert.ok(sharp.averageMargin > 80);
    assert.equal(sharp.qualified, true);
  });

  it("buckets loads with no broker under a single visible label", () => {
    const anonymous = withMetricsAll([load({ broker: null })], thresholds);
    assert.equal(calculateBrokerPerformance(anonymous, thresholds)[0].broker, "No broker");
  });
});

/* ---- Goals, pace and projection ------------------------------------------ */

describe("working days", () => {
  it("counts a six-day week as Monday through Saturday", () => {
    // 2026-08-30 is a Sunday, 2026-08-29 a Saturday.
    assert.equal(isWorkingDay("2026-08-29", 6), true);
    assert.equal(isWorkingDay("2026-08-30", 6), false);
    assert.equal(isWorkingDay("2026-08-30", 7), true);
    assert.equal(isWorkingDay("2026-08-29", 5), false);
  });

  it("counts them across a range", () => {
    assert.equal(workingDaysIn({ start: "2026-08-01", end: "2026-08-31" }, 7), 31);
    assert.equal(workingDaysIn({ start: "2026-08-01", end: "2026-08-31" }, 6), 26);
  });
});

describe("calculateGoalProgress", () => {
  const summary = summarizePeriod(
    [load({ grossRate: 12300, loadedMiles: 5000, deadheadMiles: 500 })],
    [expense({ amount: 4000 })],
    august,
    settings,
  );

  it("compares a full month against the full monthly target", () => {
    const revenue = calculateGoalProgress(summary, goals, august).find((g) => g.key === "revenue")!;
    assert.equal(revenue.target, 15000);
    assert.equal(revenue.prorated, false);
  });

  it("pro-rates a half-month target and says that it did", () => {
    const revenue = calculateGoalProgress(summary, goals, firstHalf).find(
      (g) => g.key === "revenue",
    )!;
    assert.ok(revenue.target < 15000);
    assert.equal(revenue.prorated, true);
    assert.match(revenue.note, /monthly target/);
  });

  it("does not scale a rate or a ceiling with the length of the window", () => {
    const progress = calculateGoalProgress(summary, goals, firstHalf);
    assert.equal(progress.find((g) => g.key === "profitPerMile")!.target, 1.5);
    assert.equal(progress.find((g) => g.key === "deadhead")!.target, 15);
  });

  it("treats deadhead as a ceiling, where under is on track", () => {
    const deadheadGoal = calculateGoalProgress(summary, goals, august).find(
      (g) => g.key === "deadhead",
    )!;
    assert.equal(deadheadGoal.lowerIsBetter, true);
    assert.equal(deadheadGoal.onTrack, summary.deadheadPct <= 15);
  });

  it("scales a multi-month custom range to that many months of target", () => {
    // July + August 2026 with a 7-day week: exactly two months of working
    // days, so the window owes two months of the monthly target. The old
    // implementation capped the share at 1 and quietly compared two months
    // of revenue against one month of target.
    const twoMonths = resolvePeriod("2026-07", "custom", {
      from: "2026-07-01",
      to: "2026-08-31",
    });
    const share = monthlyTargetShare(twoMonths, { ...goals, workingDaysPerWeek: 7 });
    assert.equal(share, 2);

    const revenue = calculateGoalProgress(summary, { ...goals, workingDaysPerWeek: 7 }, twoMonths).find(
      (g) => g.key === "revenue",
    )!;
    assert.equal(revenue.target, 30000);
    assert.equal(revenue.prorated, true);
  });

  it("still caps nothing but scales nothing inside one month", () => {
    const inside = resolvePeriod("2026-08", "custom", { from: "2026-08-01", to: "2026-08-31" });
    assert.equal(monthlyTargetShare(inside, { ...goals, workingDaysPerWeek: 7 }), 1);
  });

  it("shows nothing for a target that is not set", () => {
    const none = calculateGoalProgress(
      summary,
      { ...goals, monthlyRevenueTarget: 0, targetLoads: null },
      august,
    );
    assert.equal(none.find((g) => g.key === "revenue"), undefined);
    assert.equal(none.find((g) => g.key === "loads"), undefined);
  });
});

describe("calculateProjection", () => {
  const summary = summarizePeriod(
    [load({ date: "2026-08-05", grossRate: 12300 })],
    [],
    august,
    settings,
  );

  it("projects from the pace so far and marks itself applicable", () => {
    const projection = calculateProjection(summary, august, goals, "2026-08-24");
    assert.equal(projection.applicable, true);
    assert.ok(projection.workingDaysRemaining > 0);
    assert.ok(projection.projectedRevenue > summary.grossRevenue);
  });

  it("does not project a window that has already finished", () => {
    const projection = calculateProjection(summary, august, goals, "2026-09-15");
    assert.equal(projection.applicable, false);
    assert.equal(projection.workingDaysRemaining, 0);
    assert.equal(projection.projectedRevenue, summary.grossRevenue);
  });

  it("does not project from no data", () => {
    const empty = summarizePeriod([], [], august, settings);
    assert.equal(calculateProjection(empty, august, goals, "2026-08-10").applicable, false);
  });
});

describe("calculateDaySnapshot", () => {
  it("measures the day against the monthly profit target spread over working days", () => {
    const target = dailyProfitTarget("2026-08", goals);
    // 7500 over 26 working days in August 2026.
    assert.equal(target, 288.46);

    const day = calculateDaySnapshot(
      [load({ date: "2026-08-24", grossRate: 1420, loadedMiles: 487 })],
      [expense({ date: "2026-08-24", amount: 386 })],
      "2026-08-24",
      goals,
    );
    assert.equal(day.revenue, 1420);
    assert.equal(day.profit, 1034);
    assert.equal(day.verdict, "GOOD");
    assert.match(day.statement, /above your daily Operating Profit target/);
  });

  it("says nothing happened rather than reporting a bad day", () => {
    const day = calculateDaySnapshot([], [], "2026-08-24", goals);
    assert.equal(day.verdict, "NO_DATA");
    assert.match(day.statement, /Nothing recorded/);
  });
});

describe("cash activity and monthly planning", () => {
  it("keeps day-one operations and day-one cash on their own dates", () => {
    const cash = calculateCashActivity(
      [load({ id: "old", date: "2026-07-20", grossRate: 2500, status: "INVOICED" })],
      [
        expense({ date: "2026-08-01", category: "OPERATING_LEASE", amount: 800 }),
        expense({ id: "principal", date: "2026-08-01", category: "PRINCIPAL_PAYMENT", amount: 600 }),
      ],
      [{
        id: "payment",
        businessId: "b",
        loadId: "old",
        date: "2026-08-01",
        amount: 1000,
        method: null,
        reference: null,
        notes: null,
        createdAt: "",
      }],
      { start: "2026-08-01", end: "2026-08-01" },
    );
    assert.equal(cash.collectedRevenue, 1000);
    assert.equal(cash.operatingCashOutflows, 800);
    assert.equal(cash.principalPayment, 600);
    assert.equal(cash.netCashActivity, -400);
  });

  it("adds financing only to cash break-even and coverage", () => {
    const cost = calculateTrueCostPerMile(
      [load({ loadedMiles: 1000 })],
      [expense({ amount: 1000 })],
      august,
      settings,
      "August",
    );
    const obligations: FinancialObligation[] = [{
      id: "loan",
      businessId: "b",
      truckId: "t",
      name: "Truck loan",
      kind: "LOAN",
      counterparty: null,
      startedOn: null,
      endedOn: null,
      expectedMonthlyPayment: 1200,
      active: true,
      createdAt: "",
    }];
    const planning = calculateFinancialPlanning(
      { ...goals, expectedMonthlyMiles: 8000 },
      cost,
      obligations,
    );
    assert.equal(planning.operatingBreakEvenRevenue, 8000);
    assert.equal(planning.cashBreakEvenRevenue, 9200);
    assert.equal(planning.fixedObligationCoverage, 7000 / 1200);
  });
});

/* ---- Reserves ------------------------------------------------------------ */

describe("calculateReserveBalances", () => {
  const transactions: ReserveTransaction[] = [
    {
      id: "1",
      businessId: "b",
      accountId: "res_maintenance",
      date: "2026-08-15",
      type: "CONTRIBUTION",
      amount: 557,
      description: "settlement",
      settlementId: "stl_2026-08_a",
      createdAt: "",
    },
    {
      id: "2",
      businessId: "b",
      accountId: "res_maintenance",
      date: "2026-08-20",
      type: "WITHDRAWAL",
      amount: -240,
      description: "oil change",
      settlementId: null,
      createdAt: "",
    },
    {
      id: "3",
      businessId: "b",
      accountId: "res_maintenance",
      date: "2026-07-15",
      type: "CONTRIBUTION",
      amount: 500,
      description: "settlement",
      settlementId: "stl_2026-07_a",
      createdAt: "",
    },
  ];

  it("is always the running sum of its own movements", () => {
    const balance = calculateReserveBalances(accounts, transactions, august).find(
      (b) => b.account.id === "res_maintenance",
    )!;
    assert.equal(balance.balance, 817);
    assert.equal(balance.contributions, 1057);
    assert.equal(balance.withdrawals, 240);
  });

  it("separates movements inside the selected period from the lifetime total", () => {
    const balance = calculateReserveBalances(accounts, transactions, august).find(
      (b) => b.account.id === "res_maintenance",
    )!;
    assert.equal(balance.periodContributions, 557);
    assert.equal(balance.periodWithdrawals, 240);
  });

  it("reports progress only when a target exists", () => {
    const balances = calculateReserveBalances(accounts, transactions, august);
    assert.equal(balances.find((b) => b.account.kind === "TAX")!.targetProgress, null);
    assert.ok(balances.find((b) => b.account.kind === "MAINTENANCE")!.targetProgress! > 0);
  });
});

/* ---- Settlements --------------------------------------------------------- */

describe("settlements", () => {
  const loads = [
    load({ id: "a", date: "2026-08-04", grossRate: 5000, loadedMiles: 900, deadheadMiles: 100 }),
    load({ id: "b", date: "2026-08-22", grossRate: 4000, loadedMiles: 700, deadheadMiles: 300 }),
  ];
  const expenses = [
    expense({ id: "x", date: "2026-08-01", category: "TRUCK_PAYMENT", amount: 1200 }),
    expense({ id: "y", date: "2026-08-22", category: "FUEL", amount: 800 }),
  ];

  it("splits the month at the 15th, inclusive on both sides", () => {
    assert.deepEqual(settlementBounds("2026-08", "FIRST"), {
      start: "2026-08-01",
      end: "2026-08-15",
    });
    assert.deepEqual(settlementBounds("2026-08", "SECOND"), {
      start: "2026-08-16",
      end: "2026-08-31",
    });
    // Short months and leap years still land on the real last day.
    assert.equal(settlementBounds("2026-02", "SECOND").end, "2026-02-28");
    assert.equal(settlementBounds("2024-02", "SECOND").end, "2024-02-29");
    assert.equal(settlementBounds("2026-04", "SECOND").end, "2026-04-30");
  });

  it("the two halves sum exactly to the month", () => {
    const a = buildSettlementSnapshot(
      loads,
      expenses,
      settlementBounds("2026-08", "FIRST"),
      settings,
      accounts,
    );
    const b = buildSettlementSnapshot(
      loads,
      expenses,
      settlementBounds("2026-08", "SECOND"),
      settings,
      accounts,
    );
    const full = summarizePeriod(loads, expenses, august, settings);
    assert.equal(a.grossRevenue + b.grossRevenue, full.grossRevenue);
    assert.equal(a.operatingExpenses + b.operatingExpenses, full.operatingExpenses);
    assert.equal(a.totalMiles + b.totalMiles, full.totalMiles);
  });

  it("records the reserve rates that were in force at the time", () => {
    const snapshot = buildSettlementSnapshot(
      loads,
      expenses,
      settlementBounds("2026-08", "FIRST"),
      settings,
      accounts,
    );
    assert.equal(snapshot.calculationVersion, 3);
    assert.equal(snapshot.bookedRevenue, snapshot.grossRevenue);
    assert.equal(snapshot.collectedRevenue, 0);
    assert.equal(snapshot.debtService, 1200);
    assert.equal(snapshot.reserves.length, 3);
    assert.equal(snapshot.reserves[0].pct, 20);
    assert.equal(snapshot.reserves[0].kind, "TAX");
  });

  it("a snapshot does not move when the settings later do", () => {
    const range = settlementBounds("2026-08", "FIRST");
    const before = buildSettlementSnapshot(loads, expenses, range, settings, accounts);
    const after = buildSettlementSnapshot(
      loads,
      expenses,
      range,
      { ...settings, taxReservePct: 40 },
      accounts,
    );
    // The stored object is what a closed settlement keeps; recomputing with
    // new settings gives a different answer, which is exactly why it is stored.
    assert.notEqual(before.safeToPay, after.safeToPay);
    assert.equal(before.reserves[0].pct, 20);
  });

  it("enumerates every half-month in a span, newest first", () => {
    const windows = settlementWindows("2026-06", "2026-08");
    assert.equal(windows.length, 6);
    assert.deepEqual(windows[0], { month: "2026-08", half: "SECOND" });
    assert.deepEqual(windows[5], { month: "2026-06", half: "FIRST" });
  });

  it("crosses a year boundary", () => {
    const windows = settlementWindows("2025-12", "2026-01");
    assert.equal(windows.length, 4);
    assert.deepEqual(windows[0], { month: "2026-01", half: "SECOND" });
  });
});

describe("selectSettlementView", () => {
  // Only the fields the selector reads. Views arrive newest first.
  const view = (
    month: string,
    half: "FIRST" | "SECOND",
    over: { complete?: boolean; status?: "OPEN" | "CLOSED"; loadCount?: number } = {},
  ) =>
    ({
      id: `${month}-${half}`,
      month,
      half,
      status: over.status ?? "OPEN",
      complete: over.complete ?? false,
      figures: { loadCount: over.loadCount ?? 0 },
    }) as unknown as Parameters<typeof selectSettlementView>[0][number];

  const liveHalf = view("2026-08", "SECOND", { complete: false, loadCount: 1 });
  const emptyFinished = view("2026-08", "FIRST", { complete: true, loadCount: 0 });

  it("honours the window named in the URL", () => {
    const picked = selectSettlementView([liveHalf, emptyFinished], "2026-08", "first");
    assert.equal(picked?.half, "FIRST");
  });

  it("opens the finished window when there is something to settle in it", () => {
    const finishedWithLoads = view("2026-08", "FIRST", { complete: true, loadCount: 3 });
    const picked = selectSettlementView([liveHalf, finishedWithLoads]);
    assert.equal(picked?.half, "FIRST");
  });

  it("skips an empty finished window for the live one that has the money", () => {
    // The bug this replaces: on the 31st the page opened on an all-zero
    // "1 to 15" while the half-month actually being run sat in History.
    const picked = selectSettlementView([liveHalf, emptyFinished]);
    assert.equal(picked?.half, "SECOND");
  });

  it("still opens a closed window even with no loads in it", () => {
    const closedEmpty = view("2026-08", "FIRST", { complete: true, status: "CLOSED", loadCount: 0 });
    const quietLive = view("2026-08", "SECOND", { complete: false, loadCount: 0 });
    const picked = selectSettlementView([quietLive, closedEmpty]);
    assert.equal(picked?.half, "FIRST");
  });

  it("falls back to the current window when nothing has activity at all", () => {
    const quietLive = view("2026-08", "SECOND", { complete: false, loadCount: 0 });
    const quietPast = view("2026-08", "FIRST", { complete: true, loadCount: 0 });
    assert.equal(selectSettlementView([quietLive, quietPast])?.half, "SECOND");
    assert.equal(selectSettlementView([]), undefined);
  });
});

/* ---- Maintenance health --------------------------------------------------- */

describe("calculateMaintenanceHealth", () => {
  const truck: Truck = {
    id: "t",
    businessId: "b",
    name: "Unit 101",
    year: 2021,
    make: null,
    model: null,
    vin: null,
    purchasePrice: null,
    monthlyPayment: null,
    monthlyInsurance: null,
    acquiredOn: null,
    soldOn: null,
    startingOdometer: 100000,
    currentOdometer: 144780,
    active: true,
    createdAt: "",
  };

  function record(over: Partial<MaintenanceRecord> = {}): MaintenanceRecord {
    return {
      id: "m",
      businessId: "b",
      truckId: "t",
      type: "OIL_CHANGE",
      basis: "MILEAGE",
      serviceDate: "2026-06-01",
      odometer: 140000,
      cost: 320,
      vendor: null,
      nextServiceDate: null,
      nextServiceOdometer: 145000,
      expenseId: null,
      notes: null,
      createdAt: "",
      ...over,
    };
  }

  it("prices what is due from this truck's own history", () => {
    const health = calculateMaintenanceHealth(
      [record()],
      truck,
      "2026-08-29",
      { warnMiles: 2000, warnDays: 30 },
      1760,
    );
    assert.equal(health.upcoming.length, 1);
    assert.equal(health.upcomingCost, 320);
    assert.equal(health.coverage, 5.5);
  });

  it("does not invent a coverage ratio when nothing is due", () => {
    const health = calculateMaintenanceHealth(
      [record({ nextServiceOdometer: 200000 })],
      truck,
      "2026-08-29",
      { warnMiles: 2000, warnDays: 30 },
      1760,
    );
    assert.equal(health.coverage, null);
    assert.equal(health.upcomingCost, 0);
  });

  it("flags a due item that has never been priced instead of guessing", () => {
    const health = calculateMaintenanceHealth(
      [record({ cost: 0 })],
      truck,
      "2026-08-29",
      { warnMiles: 2000, warnDays: 30 },
      1760,
    );
    assert.equal(health.unpricedCount, 1);
    assert.equal(health.upcomingCost, 0);
    assert.equal(health.coverage, null);
  });
});

/* ---- Insights -------------------------------------------------------------- */

describe("buildCockpitInsights", () => {
  const loads = [load({ grossRate: 5000, loadedMiles: 1800, deadheadMiles: 200 })];
  const expenses = [expense({ amount: 2000, category: "FUEL" })];
  const summary = summarizePeriod(loads, expenses, august, settings);
  const empty = summarizePeriod([], [], august, settings);
  const costBasis = calculateTrueCostPerMile(loads, expenses, august, settings, "August");
  const deadhead = calculateDeadheadCost(summary, costBasis, settings, 15);
  const ownerPay = calculateSafeOwnerPay(summary, resolveReserveRules(settings, accounts));
  const maintenance = calculateMaintenanceHealth([], {
    id: "t",
    businessId: "b",
    name: "t",
    year: null,
    make: null,
    model: null,
    vin: null,
    purchasePrice: null,
    monthlyPayment: null,
    monthlyInsurance: null,
    acquiredOn: null,
    soldOn: null,
    startingOdometer: 0,
    currentOdometer: 0,
    active: true,
    createdAt: "",
  }, "2026-08-29", { warnMiles: 2000, warnDays: 30 }, 0);

  function build(over: Partial<Parameters<typeof buildCockpitInsights>[0]> = {}) {
    return buildCockpitInsights({
      period: august,
      summary,
      previous: empty,
      previousLabel: "July",
      categories: [],
      costBasis,
      deadhead,
      ownerPay,
      goals,
      projection: calculateProjection(summary, august, goals, "2026-08-20"),
      brokers: [],
      lanes: [],
      maintenance,
      ...over,
    });
  }

  it("says only that there is nothing to say when there are no loads", () => {
    const insights = build({ summary: empty });
    assert.equal(insights.length, 1);
    assert.equal(insights[0].id, "empty");
  });

  it("never compares against a previous period that has no loads", () => {
    const ids = build().map((i) => i.id);
    assert.equal(ids.includes("ppm-trend"), false);
    assert.equal(ids.includes("deadhead-trend"), false);
  });

  it("does compare once there is a previous period to compare with", () => {
    const previous = summarizePeriod(
      [load({ date: "2026-07-05", grossRate: 3000, loadedMiles: 1500, deadheadMiles: 500 })],
      [expense({ date: "2026-07-05", amount: 1500 })],
      resolvePeriod("2026-07", "full"),
      settings,
    );
    const ids = build({ previous }).map((i) => i.id);
    assert.ok(ids.includes("ppm-trend"));
    assert.ok(ids.includes("deadhead-trend"));
  });

  it("does not name a best broker on a single load", () => {
    const oneLoad = calculateBrokerPerformance(withMetricsAll(loads, thresholds), thresholds);
    assert.equal(build({ brokers: oneLoad }).some((i) => i.id === "top-broker"), false);
  });

  it("orders by priority, most useful first", () => {
    const insights = build();
    for (let i = 1; i < insights.length; i += 1) {
      assert.ok(insights[i - 1].priority >= insights[i].priority);
    }
  });

  it("produces no NaN or Infinity in any line", () => {
    for (const insight of build()) {
      assert.equal(insight.text.includes("NaN"), false, insight.text);
      assert.equal(insight.text.includes("Infinity"), false, insight.text);
    }
  });
});
