import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { closeNeonDatabase, getNeonDatabase } from "../src/db";
import * as s from "../src/db/schema";

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error ? postgresCode(error.cause) : undefined;
}

async function main() {
  assert.ok(new URL(process.env.NEON_DATABASE_URL ?? "").hostname.endsWith(".neon.tech"));
  const database = getNeonDatabase();
  const prefix = `schema_smoke_${randomUUID()}`;
  const id = (name: string) => `${prefix}_${name}`;
  const historical = new Date("2020-01-02T03:04:05.678Z");
  const rollback = new Error("Expected fixture rollback");
  let assertions = 0;
  try {
    await assert.rejects(database.transaction(async (tx) => {
      await tx.insert(s.business).values({ id: id("business"), name: "Schema smoke", createdAt: historical, updatedAt: historical });
      await tx.insert(s.user).values({ id: id("user"), email: `${prefix}@example.test`, passwordHash: "not-a-real-password", businessId: id("business"), role: "VIEWER" });
      await tx.insert(s.subscription).values({ id: id("subscription"), businessId: id("business"), plan: "INDIVIDUAL" });
      await tx.insert(s.financialSettings).values({ id: id("settings"), businessId: id("business") });
      await tx.insert(s.truck).values({ id: id("truck"), businessId: id("business"), name: "Unit 1", acquiredOn: "2020-02-29" });
      await tx.insert(s.driver).values({ id: id("driver"), businessId: id("business"), name: "Driver", payType: "PER_TOTAL_MILE", payRate: "0.1234", defaultTruckId: id("truck") });
      const loadValues = {
        businessId: id("business"), truckId: id("truck"), driverId: id("driver"), date: "2020-02-29",
        originCity: "Miami", originState: "FL", destinationCity: "Atlanta", destinationState: "GA",
        loadedMiles: 600, grossRate: "9999999999.99",
      };
      await tx.insert(s.load).values([{ ...loadValues, id: id("load") }, { ...loadValues, id: id("load2") }]);
      const workspace = await tx.query.business.findFirst({
        where: eq(s.business.id, id("business")),
        with: { users: true, settings: true, subscription: true, goals: true, trucks: true, loads: { with: { driver: true, driverSettlementLine: true } } },
      });
      assert.equal(workspace?.createdAt.toISOString(), historical.toISOString());
      assert.equal(workspace?.updatedAt.toISOString(), historical.toISOString());
      assert.equal(workspace?.users[0].role, "VIEWER");
      assert.equal(workspace?.subscription?.plan, "INDIVIDUAL");
      assert.equal(workspace?.settings?.fleetOverheadAllocation, "UNALLOCATED");
      assert.equal(workspace?.goals, null);
      assert.deepEqual(workspace?.trucks[0].operatingCostExemptions, {});
      assert.equal(workspace?.trucks[0].acquiredOn, "2020-02-29");
      assert.equal(workspace?.loads.length, 2);
      assert.equal(workspace?.loads[0].grossRate, "9999999999.99");
      assert.equal(workspace?.loads[0].driver?.payRate, "0.1234");
      assert.equal(workspace?.loads[0].driverSettlementLine, null);
      assert.deepEqual(workspace?.loads[0].jurisdictionMiles, []);
      assertions += 13;

      const [updated] = await tx.update(s.business).set({ name: "Updated" }).where(eq(s.business.id, id("business"))).returning();
      assert.ok(updated.updatedAt > historical);
      assertions++;
      const expectConstraint = async (action: Parameters<typeof tx.transaction>[0], code: string | string[]) => {
        await assert.rejects(tx.transaction(action), (error: unknown) => {
          const codes = Array.isArray(code) ? code : [code];
          assert.ok(codes.includes(postgresCode(error) ?? ""), `Expected PostgreSQL constraint code ${codes.join("/")}; received ${postgresCode(error)}`);
          return true;
        });
        assertions++;
      };
      await expectConstraint((nested) => nested.insert(s.truck).values({ id: id("orphan"), businessId: id("missing"), name: "Invalid" }), "23503");
      await expectConstraint((nested) => nested.update(s.financialSettings).set({ fleetOverheadAllocation: "INVALID" }).where(eq(s.financialSettings.id, id("settings"))), "23514");
      await tx.update(s.load).set({ invoiceNumber: "INV-1" }).where(eq(s.load.id, id("load")));
      await expectConstraint((nested) => nested.update(s.load).set({ invoiceNumber: "INV-1" }).where(eq(s.load.id, id("load2"))), "23505");
      await tx.insert(s.driverSettlement).values({ id: id("statement"), businessId: id("business"), driverId: id("driver"), periodStart: "2020-02-01", periodEnd: "2020-02-29" });
      const adjustment = { settlementId: id("statement"), type: "OTHER_EARNING" as const, amount: "0.01", reason: "OK" };
      await expectConstraint((nested) => nested.insert(s.driverSettlementAdjustment).values({ ...adjustment, id: id("zero"), amount: "0" }), "23514");
      await expectConstraint((nested) => nested.insert(s.driverSettlementAdjustment).values({ ...adjustment, id: id("blank"), reason: "  " }), "23514");
      await tx.insert(s.driverSettlementAdjustment).values({ ...adjustment, id: id("adjustment") });
      await tx.insert(s.paymentEvent).values({ id: id("payment"), businessId: id("business"), loadId: id("load"), date: "2020-02-29", amount: "0.01" });
      // PostgreSQL versions distinguish RESTRICT from a generic FK violation.
      await expectConstraint((nested) => nested.delete(s.load).where(eq(s.load.id, id("load"))), ["23001", "23503"]);

      const settlementValues = { businessId: id("business"), month: "2020-02", periodStart: "2020-02-01", periodEnd: "2020-02-29" };
      await tx.insert(s.settlement).values([
        { ...settlementValues, id: id("sql_null"), half: "FIRST", snapshot: null },
        { ...settlementValues, id: id("json_null"), half: "SECOND", snapshot: sql`'null'::jsonb` },
      ]);
      const nulls = await tx.select({ id: s.settlement.id, isSqlNull: sql<boolean>`${s.settlement.snapshot} is null` }).from(s.settlement).where(eq(s.settlement.businessId, id("business")));
      assert.equal(nulls.find((row) => row.id === id("sql_null"))?.isSqlNull, true);
      assert.equal(nulls.find((row) => row.id === id("json_null"))?.isSqlNull, false);
      assertions += 2;

      await tx.delete(s.driverSettlement).where(eq(s.driverSettlement.id, id("statement")));
      assert.equal((await tx.select().from(s.driverSettlementAdjustment).where(eq(s.driverSettlementAdjustment.id, id("adjustment")))).length, 0);
      await tx.delete(s.driver).where(eq(s.driver.id, id("driver")));
      assert.equal((await tx.query.load.findFirst({ where: eq(s.load.id, id("load")) }))?.driverId, null);
      await tx.update(s.business).set({ id: id("renamed") }).where(eq(s.business.id, id("business")));
      assert.equal((await tx.query.user.findFirst({ where: eq(s.user.id, id("user")) }))?.businessId, id("renamed"));
      await tx.delete(s.business).where(eq(s.business.id, id("renamed")));
      assert.equal((await tx.query.user.findFirst({ where: eq(s.user.id, id("user")) }))?.businessId, null);
      assert.equal((await tx.select().from(s.truck).where(eq(s.truck.id, id("truck")))).length, 0);
      assertions += 5;
      throw rollback;
    }, { isolationLevel: "serializable" }), (error: unknown) => error === rollback);
    assert.equal((await database.select().from(s.user).where(eq(s.user.id, id("user")))).length, 0);
    console.log(`Neon schema smoke passed: ${assertions + 1} assertions; fixtures rolled back.`);
  } finally {
    await closeNeonDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Neon schema smoke failed.");
  process.exitCode = 1;
});
