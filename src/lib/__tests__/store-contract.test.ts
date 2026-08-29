import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { JsonRepository, JsonAuthStore } from "../db/json-store";
import { PrismaRepository, PrismaAuthStore } from "../db/prisma-store";

/**
 * Parity checks that need no database.
 *
 * The behavioural contract is exercised against the JSON store in
 * store-behaviour.test.ts; this file guarantees the Postgres store cannot
 * drift out of shape without the suite noticing.
 */

function methodsOf(ctor: new (...args: never[]) => object): string[] {
  return Object.getOwnPropertyNames(ctor.prototype)
    .filter((name) => name !== "constructor" && !name.startsWith("#"))
    .sort();
}

describe("store parity", () => {
  it("both repositories expose exactly the same public methods", () => {
    const json = methodsOf(JsonRepository).filter((m) => !m.startsWith("assertScope"));
    const prisma = methodsOf(PrismaRepository).filter(
      (m) => !["business", "loadData", "expenseData", "fuelData", "maintenanceData"].includes(m),
    );
    assert.deepEqual(json, prisma);
  });

  it("both auth stores expose exactly the same public methods", () => {
    assert.deepEqual(methodsOf(JsonAuthStore), methodsOf(PrismaAuthStore));
  });

  it("both repositories require a businessId", () => {
    for (const Ctor of [JsonRepository, PrismaRepository]) {
      assert.equal(Ctor.length, 1, `${Ctor.name} should take a businessId`);
    }
  });
});
