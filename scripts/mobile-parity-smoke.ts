/** Disposable local API contract smoke; never runs against a remote host. */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
const base = new URL(process.env.MOBILE_TEST_URL ?? "http://127.0.0.1:4173");
if (!["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error("This smoke test only runs against a disposable localhost backend.");
const stamp = crypto.randomUUID();
const password = "Mobile-parity-local-password-2026";
async function request(path: string, method = "GET", data?: unknown, token?: string) {
  return fetch(new URL(path, base), { method, headers: { ...(data ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: data ? JSON.stringify(data) : undefined });
}
async function owner(label: string) {
  const email = `${label}-${stamp}@example.test`;
  const setup = await request("/api/auth/setup", "POST", { name: "Parity Test", businessName: "Parity Test", email, password });
  assert.equal(setup.status, 201, await setup.text());
  const login = await request("/api/mobile/login", "POST", { email, password });
  assert.equal(login.status, 200);
  return (await login.json()).token as string;
}
async function main() {
const token = await owner("owner");
// The JSON adapter intentionally has one workspace. Exercise the authoritative
// user/business binding with a correctly signed but mismatched session instead
// of pretending a second local owner is a separate tenant.
const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
const body = Buffer.from(JSON.stringify({ ...payload, businessId: "foreign-workspace" })).toString("base64url");
const signature = createHmac("sha256", process.env.MOBILE_TEST_AUTH_SECRET ?? "native-parity-test-only-secret-at-least-32-characters").update(body).digest("base64url");
const other = `${body}.${signature}`;
const brokerName = `Mobile Broker ${stamp.slice(0, 8)}`;
const resources = ["brokers", "dispatchers", "financing", "maintenance", "trucks", "reserve-buckets", "settings", "goals", "drivers", "ifta-rates", "ifta-mileage", "debt-payments", "loads", "invoices", "broker-contacts", "broker-merge", "truck-status", "truck-planning", "reserve-movements"];
for (const resource of resources) {
  const response = await request(`/api/mobile/manage/${resource}`, "GET", undefined, token);
  assert.equal(response.status, 200, `${resource}: ${await response.clone().text()}`);
  const body = await response.json();
  assert.ok(Array.isArray(body.fields) && Array.isArray(body.records));
  assert.ok(body.fields.every((f: { kind: string; key: string; label: string }) => f.key && f.label && ["text", "number", "date", "choice", "toggle", "multiline"].includes(f.kind)));
  assert.equal((await request(`/api/mobile/manage/${resource}`)).status, 401);
}
async function save(resource: string, id: string | null, values: Record<string, string>) {
  const response = await request(`/api/mobile/manage/${resource}`, "POST", { id, values }, token);
  assert.equal(response.status, 200, `${resource}: ${await response.clone().text()}`);
  return (await response.json()).id as string;
}
const broker = await save("brokers", null, { name: brokerName, phone: "555-0123" });
await save("broker-contacts", null, { brokerId: broker, name: "Contact", phone: "555-0124" });
await save("dispatchers", null, { name: `Mobile Dispatch ${stamp.slice(0, 8)}`, email: "dispatch@example.test" });
const driverResponse = await request("/api/mobile/drivers", "POST", { name: `Solo Driver ${stamp.slice(0, 8)}`, payType: "PERCENT_GROSS", payRate: 25 }, token);
assert.equal(driverResponse.status, 201, await driverResponse.text());
const trucks = await (await request("/api/mobile/manage/trucks", "GET", undefined, token)).json();
const truckId = trucks.records[0].id as string;
await save("trucks", truckId, { referenceMpg: "8.5" });
const ifta = await request("/api/mobile/truck", "PATCH", { truckId, iftaReportingEnabled: true }, token);
assert.equal(ifta.status, 200);
const updatedTruck = await (await request("/api/mobile/manage/trucks", "GET", undefined, token)).json();
assert.equal(updatedTruck.records[0].values.referenceMpg, "8.5");
const load = await save("loads", null, { truckId, date: "2026-09-20", originCity: "Miami", originState: "FL", destinationCity: "Atlanta", destinationState: "GA", grossRate: "1500", loadedMiles: "650", broker: brokerName, sourceKind: "DISPATCHER", sourceName: `Mobile Dispatch ${stamp.slice(0, 8)}` });
await save("ifta-mileage", load, { "mileage.FL.totalMiles": "300", "mileage.GA.totalMiles": "350" });
await save("loads", load, { notes: "Edited natively" });
const mileage = await (await request("/api/mobile/manage/ifta-mileage", "GET", undefined, token)).json();
assert.equal(mileage.records.find((r: { id: string }) => r.id === load).values["mileage.FL.totalMiles"], "300");
await save("invoices", load, { invoiceNumber: `NATIVE-${stamp.slice(0, 8)}`, invoiceDate: "2026-09-20", invoiceDueDate: "2026-10-20", billToName: brokerName });
const pdf = await request(`/api/mobile/invoices/${load}/pdf`, "GET", undefined, token);
assert.equal(pdf.status, 200);
assert.match(pdf.headers.get("content-type") ?? "", /pdf/);
assert.equal((await request(`/api/mobile/invoices/${load}/pdf`, "GET", undefined, other)).status, 401);
const foreignWrite = await request("/api/mobile/manage/brokers", "POST", { id: broker, values: { name: "Should fail" } }, other);
assert.equal(foreignWrite.status, 401);
assert.equal((await request("/api/mobile/manage/brokers", "POST", { id: null, values: { name: "" } }, token)).status, 422);
assert.equal((await request("/api/mobile/manage/not-a-resource", "GET", undefined, token)).status, 404);
const form = new FormData();
form.set("owner", "LOAD"); form.set("entityId", load); form.set("type", "RATE_CONFIRMATION");
form.set("file", new Blob([await pdf.arrayBuffer()], { type: "application/pdf" }), "native-test.pdf");
const upload = await fetch(new URL("/api/mobile/documents", base), { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
assert.equal(upload.status, 201, await upload.clone().text());
const documentId = (await upload.json()).id;
assert.equal((await request(`/api/mobile/documents/${documentId}`, "GET", undefined, other)).status, 401);
const file = await request(`/api/mobile/documents/${documentId}`, "GET", undefined, token);
assert.equal(file.status, 200);
assert.ok((await file.arrayBuffer()).byteLength > 0);
assert.equal((await request(`/api/mobile/documents/${documentId}`, "DELETE", undefined, token)).status, 200);
const costs = await request("/api/mobile/cost-per-mile?month=2026-09&period=full", "GET", undefined, token);
assert.equal(costs.status, 200);
const costData = await costs.json();
assert.ok(Array.isArray(costData.actual.lines));
assert.equal((await request("/api/mobile/rate-con/scan", "POST")).status, 401);
const account = await request("/api/mobile/account", "GET", undefined, token);
assert.equal(account.status, 200);
assert.equal((await request("/api/mobile/account", "POST", { intent: "delete", confirmation: "incorrect" }, token)).status, 422);
assert.equal((await request("/api/mobile/account", "POST", { intent: "reset", confirmation: "incorrect" }, token)).status, 422);
console.log(`PASS: ${resources.length} native catalogs; authentication, validation, session/workspace binding, driver access, MPG preservation, loads, IFTA, invoices, PDF and document lifecycle.`);

}
main().catch(error => { console.error(error); process.exitCode = 1; });
