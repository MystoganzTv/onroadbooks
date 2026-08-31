/**
 * First boot must never expose shared sample records. A missing JSON ledger
 * creates one private workspace whose operational collections are empty.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, it } from "node:test";

import type { Dataset } from "../types";

const sandbox = mkdtempSync(path.join(tmpdir(), "onroad-books-empty-store-"));
const originalCwd = process.cwd();

before(() => {
  process.chdir(sandbox);
});

after(() => {
  process.chdir(originalCwd);
});

it("starts with an empty private ledger", async () => {
  const { JsonAuthStore } = await import("../db/json-store");
  const auth = new JsonAuthStore();

  assert.equal(await auth.countUsers(), 0);

  const dataset = JSON.parse(
    readFileSync(path.join(sandbox, "data", "onroad-books.json"), "utf8"),
  ) as Dataset;

  assert.equal(dataset.trucks.length, 1);
  assert.deepEqual(dataset.users, []);
  assert.deepEqual(dataset.loads, []);
  assert.deepEqual(dataset.expenses, []);
  assert.deepEqual(dataset.fuelEntries, []);
  assert.deepEqual(dataset.documents, []);
  assert.deepEqual(dataset.maintenanceRecords, []);
  assert.deepEqual(dataset.reserveTransactions, []);
  assert.deepEqual(dataset.settlements, []);
  assert.deepEqual(dataset.drivers, []);
  assert.deepEqual(dataset.driverSettlements, []);
});
