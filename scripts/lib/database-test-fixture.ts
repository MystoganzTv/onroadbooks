import assert from "node:assert/strict";
import { Client } from "pg";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import * as schema from "../../src/db/schema";
import type { Dataset } from "../../src/lib/types";

/** Only used by the disposable local database contract runner. Never clears data. */
export async function seedDatabaseFixture(url: string, dataset: Dataset) {
  const parsed = new URL(url);
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.match(parsed.pathname, /^\/onroadbooks_contract_(prisma|drizzle)$/);
  assert.equal(process.env.ONROAD_DISPOSABLE_DATABASE, "1");
  const client = new Client({ connectionString: url });
  await client.connect();
  const groups = [
    [schema.business, [dataset.business]],
    [schema.user, dataset.users],
    [schema.financialSettings, [dataset.settings]],
    [schema.financialGoal, [dataset.goals]],
    [schema.subscription, [dataset.subscription]],
    [schema.truck, dataset.trucks],
    [schema.driver, dataset.drivers],
    [schema.financialObligation, dataset.financialObligations],
    [schema.load, dataset.loads],
    [schema.expense, dataset.expenses],
    [schema.driverSettlement, dataset.driverSettlements],
    [schema.fuelEntry, dataset.fuelEntries],
    [schema.maintenanceRecord, dataset.maintenanceRecords],
    [schema.document, dataset.documents],
    [schema.reserveAccount, dataset.reserveAccounts],
    [schema.settlement, dataset.settlements],
    [schema.reserveTransaction, dataset.reserveTransactions],
    [schema.paymentEvent, dataset.paymentEvents],
  ] as const;
  try {
    await client.query("BEGIN");
    for (const [table, rows] of groups) {
      const columns: Record<string, AnyPgColumn> = getTableColumns(table);
      for (const row of rows ?? []) {
        const values = Object.fromEntries(
          Object.entries(row).filter(
            ([key, value]) => key in columns && value !== undefined,
          ),
        );
        if ("updatedAt" in columns && !values.updatedAt)
          values.updatedAt = new Date();
        const keys = Object.keys(values);
        await client.query(
          `INSERT INTO public."${getTableName(table)}" (${keys.map((key) => `"${key}"`).join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
          keys.map((key) => {
            const value = values[key];
            const column = columns[key as keyof typeof columns];
            if (value !== null && column.dataType === "json")
              return JSON.stringify(value);
            return value;
          }),
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
