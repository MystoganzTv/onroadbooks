import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizePeriod } from "../calculations";
import { buildReport, REPORT_IDS, toCsv } from "../export";
import { calculateTrueCostPerMile } from "../finance/cost-per-mile";
import { calculateDeadheadCost } from "../finance/deadhead";
import { calculateSafeOwnerPay, resolveReserveRules } from "../finance/owner-pay";
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
