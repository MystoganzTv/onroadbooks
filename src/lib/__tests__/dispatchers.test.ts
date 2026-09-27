import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dispatcherDirectory } from "../dispatchers";
import { buildSeedDataset } from "../seed/seed-data";
import { loadSchema } from "../schemas";

describe("dispatcher records", () => {
  it("groups only dispatcher-sourced loads and counts each commission once", () => {
    const dataset = buildSeedDataset();
    const base = dataset.loads[0];
    dataset.loads = [
      { ...base, id: "a", sourceKind: "DISPATCHER", sourceName: "Alex", dispatchFee: 60 },
      { ...base, id: "b", sourceKind: "DISPATCHER", sourceName: " alex ", dispatchFee: 40 },
      { ...base, id: "c", sourceKind: "BROKER_DIRECT", sourceName: "Alex", dispatchFee: 500 },
      { ...base, id: "d", sourceKind: "SELF", sourceName: null, dispatchFee: 500 },
    ];
    dataset.expenses = [{ ...dataset.expenses[0], id: "expload_a_dispatch", loadId: "a", businessId: base.businessId, category: "DISPATCH", amount: 60 }];
    dataset.dispatchers = [{ id: "alex", businessId: base.businessId, name: "Alex", nameKey: "alex", phone: null, email: null, notes: null, createdAt: "2026-09-26" }];
    const rows = dispatcherDirectory(dataset);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].loads.length, 2);
    assert.equal(rows[0].fees, 100);
    assert.equal(rows[0].profile?.id, "alex");
  });

  it("requires a name for dispatcher attribution and accepts older clients without source fields", () => {
    const load = { ...buildSeedDataset().loads[0], sourceKind: "DISPATCHER", sourceName: "" };
    assert.equal(loadSchema.safeParse(load).success, false);
    assert.equal(loadSchema.safeParse({ ...load, sourceName: "Alex" }).success, true);
    assert.equal(loadSchema.safeParse({ ...load, sourceKind: undefined, sourceName: undefined }).success, true);
    assert.equal(loadSchema.safeParse({ ...load, sourceKind: "unknown" }).success, false);
  });
});
