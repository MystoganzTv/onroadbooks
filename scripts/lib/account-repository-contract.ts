import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AuthStore, Repository } from "../../src/lib/db/repository";
import { BusinessNotFoundError } from "../../src/lib/db/repository";
import { hashPassword, verifyPassword } from "../../src/lib/auth/session";
import {
  buildSettlementSnapshot,
  settlementBounds,
} from "../../src/lib/finance/settlement";

/** Called only inside disposable local databases or an always-rolled-back Neon transaction. */
export async function accountRepositoryContract(
  auth: AuthStore,
  repository: (id: string) => Repository,
) {
  const prefix = `contract-${randomUUID()}`;
  const startingUsers = await auth.countUsers();
  const passwordHash = await hashPassword("contract-only-password");
  const owner = await auth.createOwner({
    email: ` ${prefix.toUpperCase()}@EXAMPLE.TEST `,
    name: " Owner ",
    passwordHash,
    businessName: "Contract workspace",
  });
  const second = await auth.createOwner({
    email: `${prefix}-other@example.test`,
    passwordHash,
    businessName: "Separate workspace",
  });
  assert.notEqual(owner.businessId, second.businessId);
  assert.equal(owner.email, `${prefix}@example.test`);
  assert.equal(owner.name, "Owner");
  assert.equal(await auth.countUsers(), startingUsers + 2);
  assert.deepEqual(
    await auth.findUserByEmail(` ${owner.email.toUpperCase()} `),
    owner,
  );
  assert.deepEqual(await auth.findUserById(owner.id), owner);
  assert.equal(
    await verifyPassword("contract-only-password", owner.passwordHash),
    true,
  );
  assert.equal(
    await verifyPassword("wrong-password", owner.passwordHash),
    false,
  );
  await assert.rejects(
    auth.createOwner({ email: owner.email, passwordHash }),
    /already has an account/,
  );
  const repo = repository(owner.businessId);
  const foreign = repository(second.businessId);
  const initial = await repo.getDataset();
  assert.equal(initial.business.name, "Contract workspace");
  assert.equal(initial.trucks.length, 1);
  assert.equal(initial.loads.length, 0);
  assert.equal(initial.subscription.status, "TRIALING");
  const foreignBefore = await foreign.getDataset();

  const member = await auth.createMember({
    businessId: owner.businessId,
    email: `${prefix}-member@example.test`,
    role: "BOOKKEEPER",
  });
  assert.equal(member.joinedAt, null);
  assert.ok(member.invitedAt);
  assert.equal((await auth.listMembers(owner.businessId)).length, 2);
  await assert.rejects(auth.markMemberJoined(member.id, second.businessId));
  await assert.rejects(
    auth.updateMemberRole(member.id, second.businessId, "ADMIN"),
  );
  await assert.rejects(auth.removeMember(member.id, second.businessId));
  await assert.rejects(
    auth.resetBusinessData(member.id, owner.businessId),
    /Only the workspace owner/,
  );
  await assert.rejects(
    auth.deleteAccount(member.id, owner.businessId),
    /Only the workspace owner/,
  );
  await assert.rejects(
    auth.updateMemberRole(owner.id, owner.businessId, "VIEWER"),
    /owner role cannot be changed/i,
  );
  await assert.rejects(
    auth.removeMember(owner.id, owner.businessId),
    /owner cannot be removed/i,
  );
  const joined = await auth.markMemberJoined(member.id, owner.businessId);
  assert.ok(joined.joinedAt);
  assert.equal(
    (await auth.markMemberJoined(member.id, owner.businessId)).joinedAt,
    joined.joinedAt,
  );
  assert.equal(
    (await auth.updateMemberRole(member.id, owner.businessId, "ADMIN")).role,
    "ADMIN",
  );

  const loadInput = {
    broker: "Example Brokerage",
    date: "2024-02-29",
    invoiceNumber: "CONTRACT-1",
    invoiceDate: "2024-02-29",
    originCity: "Miami",
    originState: "FL",
    destinationCity: "Atlanta",
    destinationState: "GA",
    loadedMiles: 600,
    deadheadMiles: 20,
    grossRate: 2500.01,
    fuelCost: 0,
    tolls: 12.34,
    dispatchFee: 0,
    factoringFee: 0,
    otherExpenses: 0,
    status: "PENDING" as const,
  };
  const load = await repo.createLoad(loadInput);
  assert.equal(load.date, "2024-02-29");
  assert.equal(load.grossRate, 2500.01);
  const contact = { name: "Example Brokerage", contactName: "Dispatch Team", phone: "555-0100", email: "dispatch@example.test", mcNumber: "123456", address: "Example address", notes: "Call before arrival" };
  const broker = await repo.saveBroker(null, contact);
  assert.equal((await repo.getDataset()).brokers?.find((row) => row.id === broker.id)?.email, contact.email);
  await assert.rejects(repo.saveBroker(null, { ...contact, name: "  EXAMPLE BROKERAGE  " }), /already exists/);
  await assert.rejects(foreign.saveBroker(broker.id, contact), /does not belong/);
  const updatedBroker = await repo.saveBroker(broker.id, { ...contact, name: "Renamed Brokerage", phone: "555-0200" });
  assert.equal(updatedBroker.phone, "555-0200");
  assert.equal((await repo.getDataset()).loads.find((row) => row.id === load.id)?.broker, "Renamed Brokerage");

  await assert.rejects(foreign.updateLoad(load.id, loadInput));
  await assert.rejects(foreign.deleteLoad(load.id));
  await assert.rejects(
    foreign.createLoad({ ...loadInput, truckId: load.truckId }),
  );
  await assert.rejects(
    foreign.createPaymentEvent({ loadId: load.id, date: load.date, amount: 1 }),
  );
  const fuel = await repo.createFuelEntry({
    date: load.date,
    loadId: load.id,
    gallons: 10.123,
    pricePerGallon: 3.999,
    totalCost: 40.48,
  });
  assert.ok(fuel.expenseId);
  assert.equal(fuel.gallons, 10.123);
  await repo.createMaintenance({
    type: "OIL_CHANGE",
    basis: "DATE",
    serviceDate: load.date,
    cost: 75.25,
    recordAsExpense: true,
  });
  const payment = await repo.createPaymentEvent({
    loadId: load.id,
    date: load.date,
    amount: 2500.01,
  });
  assert.equal(payment.amount, 2500.01);
  const reserve = await repo.createReserveAccount({
    kind: "CUSTOM",
    name: "Contract reserve",
    basis: "GROSS_REVENUE",
    contributionPct: 2,
  });
  await repo.createReserveTransaction({
    accountId: reserve.id,
    date: load.date,
    type: "CONTRIBUTION",
    amount: 2.01,
    description: "Contract contribution",
  });
  const settlement = await repo.ensureSettlement("2024-02", "SECOND");
  assert.equal(
    (await repo.ensureSettlement("2024-02", "SECOND")).id,
    settlement.id,
  );
  const ledger = await repo.getDataset();
  const snapshot = buildSettlementSnapshot(
    ledger.loads,
    ledger.expenses,
    settlementBounds("2024-02", "SECOND"),
    ledger.settings,
    ledger.reserveAccounts,
  );
  const closed = await repo.closeSettlement(settlement.id, {
    snapshot,
    contributions: [
      {
        accountId: reserve.id,
        amount: 3.45,
        description: "Close contribution",
      },
    ],
  });
  assert.ok(closed.snapshot);
  // Prisma's JSON serializer rounds the last binary-float digit of ratios.
  for (const key of ["trueCostPerMile", "variableCostPerMile"] as const) {
    assert.ok(Math.abs(closed.snapshot[key] - snapshot[key]) < 1e-14);
  }
  assert.deepEqual(
    {
      ...closed.snapshot,
      trueCostPerMile: snapshot.trueCostPerMile,
      variableCostPerMile: snapshot.variableCostPerMile,
    },
    snapshot,
  );
  assert.equal(closed.status, "CLOSED");
  await assert.rejects(
    repo.closeSettlement(settlement.id, { snapshot, contributions: [] }),
    /already closed/,
  );
  const reopened = await repo.reopenSettlement(settlement.id);
  assert.equal(reopened.snapshot, null);
  assert.equal(reopened.status, "OPEN");
  assert.equal(
    (await repo.getDataset()).reserveTransactions.filter(
      (row) => row.settlementId === settlement.id,
    ).length,
    0,
  );

  const document = await repo.createDocument({
    loadId: load.id,
    label: "Driver/Carrier Information Sheet",
    type: "DRIVER_CARRIER_INFORMATION_SHEET",
    fileName: "contract.pdf",
    contentType: "application/pdf",
    sizeBytes: 42,
    storageKey: `${prefix}/contract.pdf`,
  });
  assert.equal(await foreign.deleteDocument(document.id), null);
  const savedDocuments = (await repo.getDataset()).documents;
  assert.equal(savedDocuments.length, 1);
  assert.equal(savedDocuments[0].type, "DRIVER_CARRIER_INFORMATION_SHEET");
  const accounts = await auth.listAccounts();
  const account = accounts.find((row) => row.userId === owner.id);
  assert.ok(account);
  assert.equal(account.counts.loads, 1);
  assert.equal(account.counts.fuelEntries, 1);
  assert.equal(account.counts.maintenance, 1);
  assert.equal(account.counts.documents, 1);
  assert.equal(account.counts.settlements, 1);
  assert.equal(account.counts.reserveTransactions, 1);
  assert.equal(account.counts.trucks, 1);
  assert.ok(account.lastActivityAt);
  assert.equal("passwordHash" in account, false);
  assert.equal("providerSubscriptionId" in account, false);
  await repo.updateSubscription({
    plan: "FLEET",
    status: "ACTIVE",
    currentPeriodEnd: null,
    providerSubscriptionId: null,
  });
  assert.equal(
    (await auth.listAccounts()).find((row) => row.userId === owner.id)
      ?.accessSource,
    "complimentary",
  );
  const keys = await auth.resetBusinessData(owner.id, owner.businessId);
  assert.deepEqual(keys, [document.storageKey]);
  const reset = await repo.getDataset();
  assert.equal(reset.loads.length, 0);
  assert.equal(reset.expenses.length, 0);
  assert.equal(reset.documents.length, 0);
  assert.equal(reset.brokers?.length, 0);
  assert.equal(reset.paymentEvents.length, 0);
  assert.equal(reset.subscription.plan, "FLEET");
  assert.equal(reset.business.name, "Contract workspace");
  assert.equal(reset.trucks.length, 1);
  assert.ok(await auth.findUserById(owner.id));
  await auth.removeMember(member.id, owner.businessId);
  assert.equal(await auth.findUserById(member.id), null);
  const deleted = await auth.deleteAccount(owner.id, owner.businessId);
  assert.equal(deleted.email, owner.email);
  assert.equal(await auth.findUserById(owner.id), null);
  await assert.rejects(repo.getDataset(), BusinessNotFoundError);
  assert.deepEqual(await foreign.getDataset(), foreignBefore);
  await auth.deleteAccount(second.id, second.businessId);
  assert.equal(await auth.countUsers(), startingUsers);
}
