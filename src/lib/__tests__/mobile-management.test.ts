import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { JsonRepository, JsonAuthStore } from "../db/json-store";
import { canReadManagement, decodeNativeValues, deleteManagement, managementCollection, managementPermission, saveManagement } from "../mobile/management";
import { mobileScopedDataset } from "../mobile/scope";
import { buildSeedDataset } from "../seed/seed-data";
import { roleCan } from "../roles";

const dir = mkdtempSync(path.join(tmpdir(), "onroad-mobile-management-"));
const previous = process.env.ONROAD_DATA_DIR;
let repository: JsonRepository;
before(async () => {
  process.env.ONROAD_DATA_DIR = dir;
  const owner = await new JsonAuthStore().createOwner({ email: "mobile@example.test", passwordHash: "unused-test-hash", businessName: "Native parity" });
  repository = new JsonRepository(owner.businessId);
});
after(() => { if (previous == null) delete process.env.ONROAD_DATA_DIR; else process.env.ONROAD_DATA_DIR = previous; rmSync(dir, { recursive: true, force: true }); });

describe("native management uses the web ledger", () => {
  it("creates contacts and reads legacy names without inventing profiles", async () => {
    const id = await saveManagement(repository, "brokers", { id: null, values: { name: "Test Broker", phone: "555-0100" } });
    let d = await repository.getDataset();
    assert.equal(d.brokers?.find(b => b.id === id)?.phone, "555-0100");
    await saveManagement(repository, "brokers", { id, values: { name: "Updated Broker" } });
    d = await repository.getDataset();
    assert.equal(d.brokers?.find(b => b.id === id)?.phone, "555-0100", "partial edit retains other fields");
    await assert.rejects(saveManagement(repository, "brokers", { id: null, values: { name: "updated broker" } }), /existe/);
    const dispatcher = await saveManagement(repository, "dispatchers", { id: null, values: { name: "Dispatcher", email: "dispatch@example.test" } });
    assert.ok((await repository.getDataset()).dispatchers?.some(d => d.id === dispatcher));
  });
  it("saves settings without wiping unrelated IFTA settings", async () => {
    const d = await repository.getDataset();
    const collection = managementCollection("settings", d, "OWNER");
    await saveManagement(repository, "settings", { id: "settings", values: { ...collection.records[0].values, businessName: "Native name" } });
    const updated = await repository.getDataset();
    assert.equal(updated.business.name, "Native name");
    assert.deepEqual(updated.settings.iftaTaxRates, d.settings.iftaTaxRates);
  });
  it("manages a truck, service and financing with shared ledger effects", async () => {
    const truckId = await saveManagement(repository, "trucks", { id: (await repository.getDataset()).trucks[0].id, values: { name: "Truck", referenceMpg: "8.5", startingOdometer: "10000", currentOdometer: "10000" } });
    await saveManagement(repository, "trucks", { id: truckId, values: { iftaReportingEnabled: "true" } });
    assert.equal((await repository.getDataset()).trucks.find(t => t.id === truckId)?.referenceMpg, 8.5);
    const serviceId = await saveManagement(repository, "maintenance", { id: null, values: { truckId, type: "OIL_CHANGE", basis: "MILEAGE", serviceDate: "2026-09-20", odometer: "10000", nextServiceOdometer: "20000", cost: "300", recordAsExpense: "true" } });
    let d = await repository.getDataset();
    const service = d.maintenanceRecords.find(m => m.id === serviceId)!;
    assert.equal(d.expenses.find(e => e.id === service.expenseId)?.amount, 300);
    await saveManagement(repository, "maintenance", { id: serviceId, values: { cost: "350" } });
    d = await repository.getDataset();
    assert.equal(d.expenses.filter(e => e.id === service.expenseId).length, 1);
    assert.equal(d.expenses.find(e => e.id === service.expenseId)?.amount, 350);
    await deleteManagement(repository, "maintenance", serviceId);
    assert.ok(!(await repository.getDataset()).expenses.some(e => e.id === service.expenseId));
    const obligation = await saveManagement(repository, "financing", { id: null, values: { name: "Truck loan", kind: "LOAN", truckId, startingBalance: "10000", expectedMonthlyPayment: "500", active: "true" } });
    assert.equal((await repository.getDataset()).financialObligations.find(o => o.id === obligation)?.startingBalance, 10000);
    await assert.rejects(saveManagement(repository, "trucks", { id: null, values: { name: "Over limit", startingOdometer: "0", currentOdometer: "0" } }));
  });
  it("allows driver records without Fleet", async () => {
    const id = await saveManagement(repository, "drivers", { id: null, values: { name: "Driver", payType: "PERCENT_GROSS", payRate: "25", isOwnerOperator: "false" } });
    assert.ok((await repository.getDataset()).drivers.some(d => d.id === id));
    assert.equal(roleCan("DISPATCHER", managementPermission("drivers")), true);
  });
  it("saves historical IFTA quarters and keeps missing rates unknown", async () => {
    await saveManagement(repository, "ifta-rates", { id: "2025-Q1", values: { quarter: "2025-Q1", "rates.FL": "0.42" } });
    let d = await repository.getDataset();
    const collection = managementCollection("ifta-rates", d, "OWNER", "2025-Q1");
    assert.equal(collection.records[0].values["rates.FL"], "0.42");
    assert.equal(collection.records[0].values["rates.GA"], "");
    await saveManagement(repository, "ifta-rates", { id: "2025-Q1", values: { "rates.GA": "0.30" } });
    d = await repository.getDataset();
    assert.equal(managementCollection("ifta-rates", d, "OWNER", "2025-Q1").records[0].values["rates.FL"], "0.42");
    await assert.rejects(saveManagement(repository, "ifta-rates", { id: "2025-Q1", values: { quarter: "2025-Q2" } }), /trimestre/);
  });
  it("preserves IFTA mileage when all load fields are edited and creates a real invoice", async () => {
    const truckId = (await repository.getDataset()).trucks[0].id;
    const id = await saveManagement(repository, "loads", { id: null, values: { truckId, date: "2026-09-20", originCity: "Miami", originState: "FL", destinationCity: "Atlanta", destinationState: "GA", grossRate: "1500", loadedMiles: "650", sourceKind: "DISPATCHER", sourceName: "Dispatcher" } });
    await saveManagement(repository, "ifta-mileage", { id, values: { "mileage.FL.totalMiles": "300", "mileage.GA.totalMiles": "350" } });
    await saveManagement(repository, "loads", { id, values: { commodity: "Equipment", dispatchFee: "50" } });
    let load = (await repository.getDataset()).loads.find(l => l.id === id)!;
    assert.equal(load.jurisdictionMiles?.find(m => m.jurisdiction === "FL")?.totalMiles, 300);
    assert.equal(load.sourceName, "Dispatcher");
    assert.equal(load.commodity, "Equipment");
    await assert.rejects(saveManagement(repository, "ifta-mileage", { id, values: { "mileage.FL.totalMiles": "9999" } }));
    await saveManagement(repository, "invoices", { id, values: { invoiceNumber: "NATIVE-001", invoiceDate: "2026-09-20", invoiceDueDate: "2026-10-20", billToName: "Broker" } });
    load = (await repository.getDataset()).loads.find(l => l.id === id)!;
    assert.equal(load.invoiceNumber, "NATIVE-001");
    assert.equal(load.dispatchFee, 50);
  });
  it("keeps contacts inside their broker and checks financing confirmations", async () => {
    const broker = await saveManagement(repository, "brokers", { id: null, values: { name: "Contacts Broker" } });
    const contact = await saveManagement(repository, "broker-contacts", { id: null, values: { brokerId: broker, name: "Jane", email: "jane@example.test" } });
    await saveManagement(repository, "broker-contacts", { id: contact, values: { phone: "555-0199" } });
    assert.equal((await repository.getDataset()).brokers?.find(b => b.id === broker)?.contacts?.[0].phone, "555-0199");
    await assert.rejects(saveManagement(repository, "broker-contacts", { id: contact, values: { brokerId: "foreign" } }));
    await deleteManagement(repository, "broker-contacts", contact);
    assert.equal((await repository.getDataset()).brokers?.find(b => b.id === broker)?.contacts?.length, 0);
    const truckId = (await repository.getDataset()).trucks[0].id;
    await assert.rejects(saveManagement(repository, "truck-planning", { id: truckId, values: { confirmedNone: "true" } }), /financiamiento/);
  });
  it("honors the truck filter before computing dashboard and ledger totals", () => {
    const data = buildSeedDataset();
    const first = data.trucks[0];
    const second = { ...first, id: "second-truck", name: "Truck 2" };
    data.trucks.push(second);
    data.loads[0].truckId = second.id;
    const scoped = mobileScopedDataset(data, new URLSearchParams({ truck: first.id }));
    assert.ok(!scoped.loads.some(l => l.id === data.loads[0].id));
    assert.ok(scoped.expenses.every(e => e.truckId === first.id));
    assert.deepEqual(mobileScopedDataset(data, new URLSearchParams()), data);
  });
  it("does not accept foreign record IDs, unsupported deletes or unknown fields", async () => {
    await assert.rejects(saveManagement(repository, "financing", { id: "foreign-id", values: { name: "oops" } }), /negocio/);
    await assert.rejects(deleteManagement(repository, "trucks", (await repository.getDataset()).trucks[0].id), /no permite/);
    const collection = managementCollection("financing", await repository.getDataset(), "OWNER");
    assert.deepEqual(decodeNativeValues(collection.fields, { startingBalance: "", businessId: "foreign", "__proto__.polluted": "true" }), { startingBalance: null });
    assert.equal(canReadManagement("settings", "ADMIN"), false);
    assert.equal(canReadManagement("financing", "DISPATCHER"), false);
    assert.equal(managementCollection("drivers", await repository.getDataset(), "VIEWER").canEdit, false);
  });
});
