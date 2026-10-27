import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mobileReserveLedger } from "../mobile/reserves";
import { periodFromSearchParams } from "../period-params";
import { buildSeedDataset } from "../seed/seed-data";

const period = periodFromSearchParams({ month: "2026-08", period: "full" });

describe("mobile reserves keep calculated set-asides separate from recorded money", () => {
  it("shows the web's tax and maintenance calculations even with no movements", () => {
    const dataset = buildSeedDataset();
    dataset.reserveTransactions = [];
    const ledger = mobileReserveLedger(dataset, period);
    assert.equal(ledger.total, 0);
    assert.equal(ledger.periodContributions, 0);
    assert.equal(ledger.suggestedTotal, 1672.87);
    assert.equal(ledger.accounts.find(a => a.id === "res_tax")?.suggestedContribution, 987.22);
    const maintenance = ledger.accounts.find(a => a.id === "res_maintenance")!;
    assert.equal(maintenance.suggestedContribution, 489.75);
    assert.equal(maintenance.balance, 0);
    assert.equal(maintenance.targetProgress, 0);
    assert.equal(maintenance.maintenanceByTruck[0].suggestedReserve, 489.75);
    assert.equal(ledger.safeToPay, 1978.23);
    assert.equal(Math.round((ledger.safeToPay + ledger.suggestedTotal) * 100), Math.round(ledger.cashAfterDebtService * 100));
    assert.deepEqual(dataset.reserveTransactions, [], "reading recommendations must not post money");
  });

  it("a recorded contribution changes the balance, not the period's recommendation", () => {
    const dataset = buildSeedDataset();
    const transaction = dataset.reserveTransactions[0];
    dataset.reserveTransactions = [{ ...transaction, id: "manual-test", accountId: "res_tax", date: "2026-08-15", amount: 100 }];
    const ledger = mobileReserveLedger(dataset, period);
    assert.equal(ledger.total, 100);
    assert.equal(ledger.periodContributions, 100);
    assert.equal(ledger.suggestedTotal, 1672.87);
    assert.equal(ledger.accounts.find(a => a.id === "res_tax")?.balance, 100);
    assert.equal(ledger.accounts.find(a => a.id === "res_tax")?.suggestedContribution, 987.22);
  });

  it("recalculates suggestions for the selected period without clearing balances", () => {
    const dataset = buildSeedDataset();
    const august = mobileReserveLedger(dataset, period);
    const empty = mobileReserveLedger(dataset, periodFromSearchParams({ month: "2027-01", period: "full" }));
    assert.equal(empty.total, august.total);
    assert.equal(empty.suggestedTotal, 0);
    assert.ok(empty.accounts.every(a => a.suggestedContribution === 0));
  });

  it("does not recommend contributions to inactive buckets", () => {
    const dataset = buildSeedDataset();
    dataset.reserveAccounts.find(a => a.id === "res_maintenance")!.active = false;
    const ledger = mobileReserveLedger(dataset, period);
    const maintenance = ledger.accounts.find(a => a.id === "res_maintenance")!;
    assert.equal(maintenance.suggestedContribution, 0);
    assert.deepEqual(maintenance.maintenanceByTruck, []);
    assert.equal(ledger.suggestedTotal, 1183.12);
  });
});
