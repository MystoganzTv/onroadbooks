// Local-only fixtures for RefreshUITests. No database or production requests.
// Run: node --import tsx mobile/Scripts/refresh-ui-fixtures.mjs
import { createServer } from "node:http";
import { mobileReserveLedger } from "../../src/lib/mobile/reserves.ts";
import { buildSeedDataset } from "../../src/lib/seed/seed-data.ts";
import { periodFromSearchParams } from "../../src/lib/period-params.ts";

const reserveDataset = buildSeedDataset();
reserveDataset.reserveTransactions = [];
const reserves = mobileReserveLedger(reserveDataset, periodFromSearchParams({ month: "2026-08", period: "full" }));

const load = {
  id: "refresh-load", date: "2026-10-08", loadNumber: "QA-48120375", broker: "Sample Broker",
  originCity: "Miami", originState: "FL", destinationCity: "Atlanta", destinationState: "GA",
  grossRate: 1850, loadedMiles: 650, deadheadMiles: 20, directTripCosts: 400,
  contributionProfit: 1450, contributionProfitPerMile: 2.16, allocatedOperatingCosts: 300,
  estimatedFullyLoadedOperatingProfit: 1150, debtCashBurden: 50,
  allocationBasisLabel: "Sample monthly costs", rating: "GOOD",
};
const dispatcher = {
  title: "Dispatchers", description: "Contactos y comisión de despacho.",
  fields: [
    { key: "name", label: "Nombre", kind: "text", required: true, section: "Contacto" },
    { key: "email", label: "Correo", kind: "text", required: false, section: "Contacto" },
    { key: "defaultFeePct", label: "Comisión (%)", kind: "number", required: false, section: "Comisión" },
  ],
  records: [{ id: "sample-dispatch", title: "Sample Dispatch", subtitle: "5% · dispatch@example.test",
    values: { name: "Sample Dispatch", email: "dispatch@example.test", defaultFeePct: "5" },
    details: [{ label: "Comisión", value: "5%" }] }],
  defaults: {}, canCreate: true, canEdit: true, canDelete: false, scanAvailable: false,
};
let reads = 0;
let failNext = false;
createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1:4187").pathname;
  const send = (status, body) => {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(body));
  };
  if (path === "/test/reset") { reads = 0; failNext = false; return send(200, {}); }
  if (path === "/test/fail-next-dashboard") { failNext = true; return send(200, {}); }
  if (path === "/api/mobile/login") return send(200, {
    token: "local-ui-fixture-only", expiresAt: "2099-01-01T00:00:00Z", email: "refresh@example.test", name: "QA",
  });
  if (path === "/api/mobile/dashboard") {
    if (failNext) { failNext = false; return send(503, { error: "Temporarily unavailable" }); }
    reads += 1;
    const body = {
      periodLabel: `Refresh ${reads}`, bookedRevenue: 1850, operatingExpenses: 400, operatingProfit: 1450,
      bookedRevenueDeltaPct: 0, operatingProfitDeltaPct: 0, actualCostPerMile: 0.6,
      collectedRevenue: 1850, accountsReceivable: 0, interestExpense: 0, principalPayment: 0,
      debtService: 0, cashAfterDebtService: 1450, debtServicePerMile: 0, planning: null, safeToPay: null,
      totalMiles: 670, deadheadPct: 3,
      today: { bookedRevenue: 1850, operatingProfit: 1450, loadCount: 1,
        cashActivity: { collectedRevenue: 1850, netCashActivity: 1450 } },
      expenseBreakdown: [], recentLoads: [load], reserves: [],
    };
    // Keep the request in flight while the refresh spinner changes the UI.
    return setTimeout(() => send(200, body), 350);
  }
  if (path === "/api/mobile/loads") return send(200, { periodLabel: "October", loads: [load, { ...load, id: "no-number", loadNumber: null }] });
  if (path === "/api/mobile/manage/dispatchers") return send(200, dispatcher);
  if (path === "/api/mobile/reserves") return send(200, reserves);
  // Account/StoreKit calls are unrelated to this test and must stay local too.
  return send(403, { error: "Not part of this local fixture" });
}).listen(4187, "127.0.0.1", () => console.log("Refresh UI fixtures: http://127.0.0.1:4187"));
