import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizePeriod } from "../calculations";
import { buildReport, reportFileName, REPORT_IDS, toCsv } from "../export";
import { calculateTrueCostPerMile } from "../finance/cost-per-mile";
import { calculateDeadheadCost } from "../finance/deadhead";
import { calculateSafeOwnerPay, resolveReserveRules } from "../finance/owner-pay";
import { expensesForTruck, loadsForTruck } from "../fleet";
import { resolvePeriod } from "../periods";
import { buildSeedDataset } from "../seed/seed-data";

const dataset = buildSeedDataset();
const period = resolvePeriod("2026-08", "full");

describe("toCsv", () => {
  it("neutralises every formula trigger", () => {
    for (const dangerous of ["=cmd|'/C calc'!A0", "+1+1", "-2+3", "@SUM(A1)", "\tx", "\rx"]) {
      const csv = toCsv({ title: "t", columns: ["a"], rows: [[dangerous]] });
      const cell = csv.split("\r\n")[1];
      assert.ok(cell.startsWith('"\''), `not neutralised: ${JSON.stringify(cell)}`);
    }
  });

  it("leaves ordinary text and numbers alone", () => {
    const csv = toCsv({ title: "t", columns: ["a", "b"], rows: [["Acme Freight", -12.5]] });
    assert.equal(csv.split("\r\n")[1], "Acme Freight,-12.5");
  });

  it("still quotes commas, quotes and newlines correctly", () => {
    const csv = toCsv({ title: "t", columns: ["a"], rows: [['He said "hi", loudly']] });
    assert.equal(csv.split("\r\n")[1], '"He said ""hi"", loudly"');
  });

  it("starts with a BOM so Excel reads UTF-8", () => {
    assert.ok(toCsv({ title: "t", columns: ["a"], rows: [] }).startsWith("﻿"));
  });
});

describe("buildReport", () => {
  it("builds every report without throwing", () => {
    for (const id of REPORT_IDS) {
      const table = buildReport(id, dataset, period);
      assert.ok(table.columns.length > 0, id);
      assert.ok(typeof table.title === "string", id);
    }
  });

  it("never puts a value in a row wider than its header", () => {
    for (const id of REPORT_IDS) {
      const table = buildReport(id, dataset, period);
      for (const row of table.rows) {
        assert.ok(
          row.length <= table.columns.length,
          `${id}: a row has ${row.length} cells for ${table.columns.length} columns`,
        );
      }
    }
  });

  it("keeps summary labels out of numeric columns", () => {
    const mileage = buildReport("mileage", dataset, period);
    const numericColumns = mileage.columns
      .map((c, i) => [c, i] as const)
      .filter(([c]) => /miles|%/i.test(c))
      .map(([, i]) => i);

    for (const row of mileage.rows) {
      if (typeof row[0] === "string" && row[0].startsWith("Deadhead cost")) {
        for (const i of numericColumns) {
          assert.equal(row[i] ?? "", "", `label row leaked into ${mileage.columns[i]}`);
        }
      }
    }
  });

  it("the loads report totals match the period summary", () => {
    const table = buildReport("loads", dataset, period);
    const rateColumn = table.columns.indexOf("Gross Rate");
    const total = table.rows.reduce((sum, row) => sum + Number(row[rateColumn] ?? 0), 0);
    assert.ok(total > 0);
    assert.equal(Math.round(total * 100) / 100, 9795);
  });

  it("exports one truck without leaking another unit or company reserves", () => {
    const first = dataset.trucks[0];
    const second = { ...first, id: "truck_export_102", name: "Unit 102" };
    const scoped = {
      ...dataset,
      trucks: [first, second],
      loads: dataset.loads.map((load, index) => ({
        ...load,
        truckId: index % 2 === 0 ? first.id : second.id,
      })),
      expenses: dataset.expenses.map((expense, index) => ({
        ...expense,
        truckId: index % 2 === 0 ? first.id : second.id,
        scope: "TRUCK" as const,
      })),
    };

    const loads = buildReport("loads", scoped, period, second.id);
    const truckColumn = loads.columns.indexOf("Truck");
    assert.ok(loads.rows.length > 0);
    assert.ok(loads.rows.every((row) => row[truckColumn] === second.name));

    const profitLoss = buildReport("profit-loss", scoped, period, second.id);
    const labels = profitLoss.rows.map((row) => String(row[0] ?? ""));
    assert.ok(labels.includes("Truck contribution"));
    assert.equal(labels.includes("Safe to pay yourself"), false);
  });

  it("reconciles a unit P&L to that unit's on-screen contribution", () => {
    const first = dataset.trucks[0];
    const second = { ...first, id: "truck_pnl_202", name: "Unit 202 / East" };
    const scoped = {
      ...dataset,
      trucks: [first, second],
      loads: dataset.loads.map((load, index) => ({
        ...load,
        truckId: index % 2 === 0 ? first.id : second.id,
      })),
      expenses: dataset.expenses.map((expense, index) => ({
        ...expense,
        truckId: index % 2 === 0 ? first.id : second.id,
        scope: "TRUCK" as const,
      })),
    };
    const summary = summarizePeriod(
      loadsForTruck(scoped.loads, second.id),
      expensesForTruck(scoped.expenses, second.id),
      period,
      scoped.settings,
    );
    const report = buildReport("profit-loss", scoped, period, second.id);
    const row = (label: string) => report.rows.find((candidate) => candidate[0] === label);

    assert.equal(Number(row("Gross revenue")?.[1]), summary.grossRevenue);
    assert.equal(Number(row("Total operating expenses")?.[1]), summary.operatingExpenses);
    assert.equal(Number(row("Truck contribution")?.[1]), summary.netProfit);
    assert.match(report.title, /Unit 202 \/ East/);
    assert.equal(
      reportFileName("profit-loss", period, second.name),
      `onroad-books-profit-loss-unit-202-east-${period.start}-to-${period.end}.csv`,
    );
  });
});

describe("export consistency with the app", () => {
  const summary = summarizePeriod(dataset.loads, dataset.expenses, period, dataset.settings);

  it("P&L reserves are the app's Safe to Pay engine, custom buckets included", () => {
    const pay = calculateSafeOwnerPay(
      summary,
      resolveReserveRules(dataset.settings, dataset.reserveAccounts),
    );
    const table = buildReport("profit-loss", dataset, period);
    const rows = table.rows.map((r) => r.map(String));

    // Every active bucket appears by name -- the seed carries a custom
    // Emergency Fund the legacy two-bucket breakdown used to drop.
    for (const reserve of pay.reserves) {
      assert.ok(
        rows.some((r) => r[0] === reserve.name && Number(r[1]) === reserve.amount),
        `${reserve.name} missing or wrong in the export`,
      );
    }
    const safeRow = rows.find((r) => r[0] === "Safe to pay yourself");
    assert.ok(safeRow, "Safe to pay row missing");
    assert.equal(Number(safeRow![1]), pay.safeToPay);
  });

  it("mileage report prices deadhead exactly like the dashboard card", () => {
    const basis = calculateTrueCostPerMile(
      dataset.loads,
      dataset.expenses,
      period,
      dataset.settings,
      period.label,
    );
    const deadhead = calculateDeadheadCost(summary, basis, dataset.settings, null);
    const table = buildReport("mileage", dataset, period);
    const costRow = table.rows.find((r) => String(r[0]).startsWith("Deadhead cost ("));
    assert.ok(costRow, "deadhead cost line missing");
    assert.ok(String(costRow![0]).endsWith(`: ${deadhead.cost}`), String(costRow![0]));
  });
});
