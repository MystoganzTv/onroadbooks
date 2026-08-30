/**
 * Postgres smoke check.
 *
 * The behavioural suite runs against the JSON store, and `store-contract`
 * only compares the two classes' method NAMES. Between those two facts sits
 * everything the Prisma store does differently: foreign keys, transactions,
 * generated ids, and a JSON column for the settlement snapshot. This script
 * exercises that seam against a real database.
 *
 *   DATABASE_URL=... npm run db:push && npm run db:seed
 *   DATABASE_URL=... npm run smoke:postgres
 *
 * It asserts the rules that cannot be proven without a server:
 *   - the built-in reserve buckets are rows, not objects invented on read;
 *   - closing a settlement stores the snapshot AND posts its contributions;
 *   - reopening removes exactly those contributions and nothing else;
 *   - a fuel purchase keeps its ledger row linked across a delete.
 */

import assert from "node:assert/strict";

import { PrismaClient } from "../src/generated/prisma";
import { PrismaRepository } from "../src/lib/db/prisma-store";
import { buildSettlementSnapshot, settlementBounds } from "../src/lib/finance/settlement";
import { roundMoney } from "../src/lib/calculations";

const prisma = new PrismaClient();
let passed = 0;
const ok = (name: string) => {
  passed += 1;
  console.log(`  ok  ${name}`);
};

async function main() {
  const business = await prisma.business.findFirst({ orderBy: { createdAt: "asc" } });
  assert.ok(business, "No business found. Run `npm run db:seed` first.");
  const repository = new PrismaRepository(business.id);

  // --- the dataset reads, and the buckets are real rows --------------------
  const dataset = await repository.getDataset();
  assert.ok(dataset.loads.length > 0, "the seeded loads are readable");
  ok(`dataset reads (${dataset.loads.length} loads, ${dataset.expenses.length} expenses)`);

  const storedAccounts = await prisma.reserveAccount.findMany({
    where: { businessId: business.id },
  });
  for (const account of dataset.reserveAccounts) {
    assert.ok(
      storedAccounts.some((row) => row.id === account.id),
      `reserve bucket ${account.name} is a row in the database, not an object invented on read`,
    );
  }
  ok(`every reserve bucket handed out exists in the database (${storedAccounts.length})`);

  // --- close and reopen ----------------------------------------------------
  const month = "2026-07";
  const half = "SECOND" as const;
  const existing = await repository.ensureSettlement(month, half);
  if (existing.status === "CLOSED") await repository.reopenSettlement(existing.id);

  const beforeMovements = await prisma.reserveTransaction.count({
    where: { businessId: business.id },
  });

  const range = settlementBounds(month, half);
  const snapshot = buildSettlementSnapshot(
    dataset.loads,
    dataset.expenses,
    range,
    dataset.settings,
    dataset.reserveAccounts,
  );
  const contributions = snapshot.reserves
    .filter((reserve) => reserve.amount > 0)
    .map((reserve) => ({
      accountId: reserve.accountId,
      amount: reserve.amount,
      description: `${reserve.pct}% - smoke check`,
    }));
  assert.ok(contributions.length > 0, "the period produces at least one contribution to post");

  const settlement = await repository.ensureSettlement(month, half);
  const closed = await repository.closeSettlement(settlement.id, {
    snapshot,
    contributions,
    notes: null,
  });
  assert.equal(closed.status, "CLOSED", "the settlement reports closed");
  assert.ok(closed.snapshot, "the snapshot is stored, not recomputed");
  assert.equal(
    roundMoney(closed.snapshot!.safeToPay),
    roundMoney(snapshot.safeToPay),
    "the stored snapshot is the one that was built",
  );
  ok(`closing ${month} ${half} freezes a snapshot`);

  const posted = await prisma.reserveTransaction.findMany({
    where: { settlementId: settlement.id },
  });
  assert.equal(
    posted.length,
    contributions.length,
    "every contribution the snapshot implies is posted, and each is tagged with the settlement",
  );
  ok(`the close posts ${posted.length} tagged contributions`);

  await repository.reopenSettlement(settlement.id);
  const reopened = await prisma.settlement.findUniqueOrThrow({ where: { id: settlement.id } });
  assert.equal(reopened.status, "OPEN", "reopening returns the settlement to open");
  assert.equal(reopened.snapshot, null, "reopening clears the snapshot");
  assert.equal(
    await prisma.reserveTransaction.count({ where: { businessId: business.id } }),
    beforeMovements,
    "reopening removes exactly what the close wrote, and nothing else",
  );
  ok("reopening reverses the close to the row");

  // --- a fuel purchase is counted once, and stays linked -------------------
  const fuel = await repository.createFuelEntry({
    date: "2026-08-20",
    gallons: 40,
    pricePerGallon: 3.9,
    totalCost: 156,
    odometer: 999_000,
    location: "Smoke Check, VA",
  });
  const linked = await prisma.fuelEntry.findUniqueOrThrow({ where: { id: fuel.id } });
  assert.ok(linked.expenseId, "a fuel purchase writes its ledger row and links it");
  const ledgerRow = await prisma.expense.findUniqueOrThrow({ where: { id: linked.expenseId! } });
  assert.equal(Number(ledgerRow.amount), 156, "the ledger row carries the cost");
  ok("a fuel purchase writes exactly one linked ledger row");

  await repository.deleteFuelEntry(fuel.id);
  assert.equal(
    await prisma.expense.findUnique({ where: { id: linked.expenseId! } }),
    null,
    "deleting the fuel purchase takes its ledger row with it",
  );
  ok("deleting the fuel purchase removes its ledger row");

  // --- scoping -------------------------------------------------------------
  const stranger = new PrismaRepository("not-this-business");
  await assert.rejects(() => stranger.getDataset(), "another business's session cannot read");
  ok("a repository bound to another business cannot read these rows");

  console.log(`\n${passed} checks passed against Postgres.`);
}

main()
  .catch((error) => {
    console.error("\nSMOKE CHECK FAILED\n", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
