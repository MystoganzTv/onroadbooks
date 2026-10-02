import "server-only";

import { z } from "zod";
import { formatLoadReference } from "@/lib/load-reference";
import { isRateConScanConfigured } from "@/lib/rate-con/extract";
import type { Repository } from "@/lib/db/repository";
import { LOAD_SOURCE_KINDS, type Dataset, type MemberRole } from "@/lib/types";
import { roleCan, type Permission } from "@/lib/roles";
import { canWrite, planAllows, truckAllowance, type PlanCapability } from "@/lib/plans";
import { activeTrucks } from "@/lib/fleet";
import { todayISO } from "@/lib/periods";
import { duplicateInvoiceNumber, invoiceIssuePatch, nextInvoiceNumber } from "@/lib/invoices";
import { brokerContactSchema, brokerContactsSchema, brokerSchema } from "@/lib/broker-schema";
import { brokerContactsOf, brokerNameKey, brokerNames } from "@/lib/brokers";
import { dispatcherDirectory, dispatcherSchema } from "@/lib/dispatchers";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { MAINTENANCE_TYPES } from "@/lib/maintenance";
import { IFTA_JURISDICTIONS, currentIftaQuarter, iftaRateKey } from "@/lib/ifta";
import { summarizeDebtBalance, nextScheduledPaymentDate } from "@/lib/finance/debt-obligation";
import {
  financialObligationSchema, maintenanceSchema, truckSchema, reserveAccountSchema,
  settingsSchema, goalSchema, driverSchema, iftaRatesSchema, jurisdictionMilesSchema,
  debtPaymentClassificationSchema, loadSchema, invoiceSchema, reserveTransactionSchema, truckFinancingConfirmationSchema, truckOperatingCostExemptionsSchema,
} from "@/lib/schemas";

// A deliberately closed catalog. The phone renders these fields with native
// SwiftUI controls; no HTML, scripts, database credentials or arbitrary methods.
export const RESOURCE_IDS = [
  "brokers", "dispatchers", "financing", "maintenance", "trucks", "reserve-buckets",
  "settings", "goals", "drivers", "ifta-rates", "ifta-mileage", "debt-payments", "loads", "invoices", "broker-contacts", "broker-merge", "truck-status", "truck-planning", "reserve-movements",
] as const;
export type ResourceId = typeof RESOURCE_IDS[number];
export const resourceSchema = z.enum(RESOURCE_IDS);
export interface FieldOption { value: string; label: string }
export interface NativeField {
  key: string; label: string; kind: "text" | "number" | "date" | "toggle" | "choice" | "multiline";
  required: boolean; options?: FieldOption[]; section: string;
}
export interface NativeRecord {
  id: string; title: string; subtitle: string; values: Record<string, string>;
  details: { label: string; value: string }[];
}
export interface NativeCollection {
  title: string; description: string; fields: NativeField[]; records: NativeRecord[];
  defaults: Record<string, string>; canCreate: boolean; canEdit: boolean; canDelete: boolean;
  refusal: string | null;
  scanAvailable: boolean;
}
const permissions: Record<ResourceId, Permission> = {
  "broker-contacts": "manage_loads", "broker-merge": "manage_loads", "truck-status": "manage_fleet", "truck-planning": "manage_owner_finances", "reserve-movements": "manage_owner_finances",
  loads: "manage_loads", invoices: "manage_finances", brokers: "manage_loads", dispatchers: "manage_loads", financing: "manage_finances",
  maintenance: "manage_maintenance", trucks: "manage_fleet", "reserve-buckets": "manage_owner_finances",
  settings: "manage_owner_finances", goals: "manage_business", drivers: "manage_drivers",
  "ifta-rates": "manage_ifta", "ifta-mileage": "manage_ifta", "debt-payments": "manage_expenses",
};
export function managementPermission(resource: ResourceId) { return permissions[resource]; }
export function managementCapability(resource: ResourceId): PlanCapability | undefined {
  return resource === "reserve-buckets" || resource === "reserve-movements" || resource === "goals" ? "cockpit" : undefined;
}
export function canReadManagement(resource: ResourceId, role: MemberRole) {
  // Match the web's owner-only controls; do not leak them through a read API.
  if (["settings", "reserve-buckets", "reserve-movements", "truck-planning", "goals"].includes(resource)) return role === "OWNER";
  if (["financing", "debt-payments"].includes(resource)) return roleCan(role, "manage_finances");
  return true;
}
const f = (key: string, label: string, kind: NativeField["kind"] = "text", required = false, section = "General"): NativeField => ({ key, label, kind, required, section });
const options = (values: readonly string[]): FieldOption[] => values.map(value => ({ value, label: value.replaceAll("_", " ") }));
const choice = (key: string, label: string, values: readonly string[] | FieldOption[], required = false, section = "General"): NativeField => ({ ...f(key, label, "choice", required, section), options: typeof values[0] === "string" ? options(values as string[]) : values as FieldOption[] });
const number = (key: string, label: string, required = false, section = "General") => f(key, label, "number", required, section);
const date = (key: string, label: string, required = false) => f(key, label, "date", required);
const toggle = (key: string, label: string) => f(key, label, "toggle", true);
const notes = () => f("notes", "Notas", "multiline");
function getValue(row: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) => value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined, row);
}
function valuesFor(row: object, fields: NativeField[]): Record<string, string> {
  return Object.fromEntries(fields.map(field => {
    const value = getValue(row as Record<string, unknown>, field.key);
    return [field.key, value == null ? "" : String(value)];
  }));
}
const money = (amount: number | null | undefined) => amount == null ? "Sin datos" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

export function managementCollection(resource: ResourceId, dataset: Dataset, role: MemberRole, quarter = currentIftaQuarter()): NativeCollection {
  const trucks = dataset.trucks.map(row => ({ value: row.id, label: row.name }));
  const truck = (key = "truckId") => choice(key, "Camión", trucks);
  let title = "", description = "";
  let fields: NativeField[] = [];
  let rows: { id: string; title: string; subtitle?: string; data: object; details?: NativeRecord["details"] }[] = [];
  let defaults: Record<string, unknown> = {};
  let create = true, remove = false;
  switch (resource) {
    case "broker-contacts":
      title = "Contactos de brokers"; description = "Personas y medios de contacto de cada broker.";
      fields = [choice("brokerId", "Broker", (dataset.brokers ?? []).map(b => ({ value: b.id, label: b.name })), true), f("name", "Nombre", "text", true), f("phone", "Teléfono"), f("phoneExtension", "Extensión"), f("email", "Email"), notes()];
      rows = (dataset.brokers ?? []).flatMap(b => brokerContactsOf(b).map(c => ({ id: `${b.id}:${c.id}`, title: c.name, subtitle: b.name, data: { ...c, brokerId: b.id } })));
      remove = true; break;
    case "broker-merge":
      title = "Unificar brokers"; description = "Mueve las cargas y contactos al broker seleccionado. Revisa el destino antes de guardar.";
      fields = [choice("targetId", "Broker de destino", (dataset.brokers ?? []).map(b => ({ value: b.id, label: b.name })), true)];
      rows = brokerNames(dataset.loads, dataset.brokers).map(name => ({ id: (dataset.brokers ?? []).find(b => b.nameKey === brokerNameKey(name))?.id ?? `name:${name}`, title: name, data: {} }));
      create = false; break;
    case "truck-status":
      title = "Estado de los camiones"; description = "Retirar conserva el historial y libera el cupo del plan. Reactivar respeta el límite del plan.";
      fields = [toggle("active", "Activo"), date("soldOn", "Fecha de venta")];
      rows = dataset.trucks.map(t => ({ id: t.id, title: t.name, subtitle: t.active ? "Activo" : "Retirado", data: t })); create = false; break;
    case "truck-planning":
      title = "Perfil de costos"; description = "Confirma las excepciones reales del camión. La ausencia de gastos no se interpreta como un costo de cero.";
      fields = [toggle("confirmedNone", "Sin financiamiento"), ...["INSURANCE", "MAINTENANCE_REPAIRS", "PERMITS_REGISTRATION", "RECURRING_SERVICES"].map((key, i) => ({ ...toggle(`exemptions.${key}`, ["Seguro no aplica", "Mantenimiento no aplica", "Permisos no aplican", "Servicios recurrentes no aplican"][i]), section: "Excepciones" }))];
      rows = dataset.trucks.map(t => ({ id: t.id, title: t.name, data: { confirmedNone: t.financingConfirmedNone === true, exemptions: Object.fromEntries(["INSURANCE", "MAINTENANCE_REPAIRS", "PERMITS_REGISTRATION", "RECURRING_SERVICES"].map(key => [key, Boolean(t.operatingCostExemptions?.[key as keyof typeof t.operatingCostExemptions])])) } })); create = false; break;
    case "reserve-movements":
      title = "Movimientos de reservas"; description = "Aportaciones, retiros y ajustes manuales. Los movimientos automáticos no se modifican aquí.";
      fields = [choice("accountId", "Cubeta", dataset.reserveAccounts.map(a => ({ value: a.id, label: a.name })), true), date("date", "Fecha", true), choice("type", "Movimiento", ["CONTRIBUTION", "WITHDRAWAL", "ADJUSTMENT"], true), number("amount", "Monto ($)", true), f("description", "Descripción", "text", true), toggle("negative", "Ajuste negativo")];
      rows = dataset.reserveTransactions.filter(t => !t.settlementId).map(t => ({ id: t.id, title: t.description, subtitle: `${t.date} · ${money(t.amount)}`, data: { ...t, amount: Math.abs(t.amount), negative: t.amount < 0 } })); defaults = { date: todayISO(), type: "CONTRIBUTION", negative: false }; remove = true; break;
    case "loads":
      title = "Cargas"; description = "Todos los datos de la carga, asignación, equipo y costos del viaje.";
      fields = [truck(), choice("driverId", "Chofer", dataset.drivers.map(d => ({ value: d.id, label: d.name }))), date("date", "Recogida", true), date("deliveryDate", "Entrega"), f("loadNumber", "PO / número de carga"), f("originCity", "Ciudad de origen", "text", true), f("originState", "Estado de origen", "text", true), f("destinationCity", "Ciudad de destino", "text", true), f("destinationState", "Estado de destino", "text", true), f("broker", "Broker"), f("brokerContact", "Contacto del broker"), choice("sourceKind", "Origen de la carga", LOAD_SOURCE_KINDS), f("sourceName", "Dispatcher / origen"), number("grossRate", "Tarifa ($)", true), number("loadedMiles", "Millas cargadas", true), number("deadheadMiles", "Millas vacías", true), number("endingOdometer", "Odómetro final"), ...["fuelCost", "tolls", "dispatchFee", "factoringFee", "otherExpenses"].map((key, i) => number(key, ["Combustible ($)", "Peajes ($)", "Dispatch ($)", "Factoring ($)", "Otros costos ($)"][i], true, "Costos del viaje")), number("claimDeduction", "Descuento del broker ($)", false, "Costos del viaje"), f("claimReason", "Motivo del descuento"), choice("status", "Estado", ["PENDING", "INVOICED", "PAID"], true), choice("equipmentType", "Equipo", ["BOX_TRUCK", "DRY_VAN", "REEFER", "FLATBED", "POWER_ONLY", "SPRINTER_VAN", "OTHER"]), choice("loadCapacity", "Capacidad", ["FULL", "PARTIAL"]), number("equipmentLengthFt", "Largo del equipo (ft)"), number("weightLbs", "Peso (lb)"), f("commodity", "Mercancía"), notes()];
      rows = dataset.loads.map(row => ({ id: row.id, title: formatLoadReference(row.loadNumber) ?? `${row.originCity} → ${row.destinationCity}`, subtitle: [row.loadNumber ? `${row.originCity} → ${row.destinationCity}` : null, row.date, money(row.grossRate)].filter(Boolean).join(" · "), data: row }));
      defaults = { date: todayISO(), status: "PENDING", deadheadMiles: 0, fuelCost: 0, tolls: 0, dispatchFee: 0, factoringFee: 0, otherExpenses: 0, claimDeduction: 0 }; break;
    case "invoices":
      title = "Facturas"; description = "Documentos de factura opcionales. Los ingresos se registran con la carga.";
      fields = [f("invoiceNumber", "Número de factura", "text", true), date("invoiceDate", "Emisión", true), date("invoiceDueDate", "Vencimiento", true), f("billToName", "Cliente", "text", true), f("billToEmail", "Email"), f("billToAddress", "Dirección", "multiline"), f("invoiceNotes", "Notas", "multiline")];
      rows = dataset.loads.map(row => ({ id: row.id, title: row.invoiceNumber ?? formatLoadReference(row.loadNumber) ?? `${row.originCity} → ${row.destinationCity}`, subtitle: `${row.invoiceNumber ? "Emitida" : "Sin factura"} · ${money(row.grossRate)}`, data: { ...row, invoiceNumber: row.invoiceNumber ?? nextInvoiceNumber(dataset.loads, todayISO()), invoiceDate: row.invoiceDate ?? todayISO(), invoiceDueDate: row.invoiceDueDate ?? todayISO(), billToName: row.billToName ?? row.broker }, details: [{ label: "Trayecto", value: `${row.originCity} → ${row.destinationCity}` }] }));
      create = false; break;
    case "brokers": {
      title = "Brokers"; description = "Contactos y cargas del broker.";
      fields = [f("name", "Nombre", "text", true), f("contactName", "Contacto"), f("phone", "Teléfono"), f("phoneExtension", "Extensión"), f("email", "Email"), f("mcNumber", "MC"), f("address", "Dirección", "multiline"), notes()];
      rows = brokerNames(dataset.loads, dataset.brokers).map(name => {
        const profile = (dataset.brokers ?? []).find(b => b.nameKey === brokerNameKey(name));
        const loads = dataset.loads.filter(l => brokerNameKey(l.broker ?? "") === brokerNameKey(name));
        return { id: profile?.id ?? `name:${name}`, title: name, subtitle: `${loads.length} cargas · ${money(loads.reduce((sum, l) => sum + l.grossRate, 0))}`, data: profile ?? { name }, details: loads.map(l => ({ label: `${l.date} · ${l.originCity} → ${l.destinationCity}`, value: money(l.grossRate) })) };
      });
      remove = true; break;
    }
    case "dispatchers":
      title = "Dispatchers"; description = "Contactos, cargas y comisiones de despacho.";
      fields = [f("name", "Nombre", "text", true), f("phone", "Teléfono"), f("email", "Email"), notes()];
      rows = dispatcherDirectory(dataset).map(row => ({ id: row.profile?.id ?? `name:${row.name}`, title: row.name, subtitle: `${row.loads.length} cargas · ${money(row.fees)} en comisiones`, data: row.profile ?? { name: row.name }, details: row.loads.map(l => ({ label: `${l.date} · ${l.originCity} → ${l.destinationCity}`, value: money(l.grossRate) })) }));
      break;
    case "financing":
      title = "Financiamiento"; description = "Préstamos, arrendamientos y pagos mensuales. El saldo se calcula con el principal registrado.";
      fields = [f("name", "Nombre", "text", true), choice("kind", "Tipo", ["LOAN", "OPERATING_LEASE", "UNKNOWN"], true), truck(), f("counterparty", "Prestamista"), number("startingBalance", "Saldo inicial ($)"), number("aprPercent", "APR (%)"), number("paymentDueDay", "Día de pago (1–31)"), number("expectedMonthlyPayment", "Pago mensual ($)"), date("startedOn", "Fecha inicial"), date("endedOn", "Fecha de cierre"), toggle("active", "Activo")];
      rows = dataset.financialObligations.map(row => {
        const balance = summarizeDebtBalance(row, dataset.expenses, todayISO());
        return { id: row.id, title: row.name, subtitle: `${row.active ? "Activo" : "Cerrado"} · ${money(row.expectedMonthlyPayment)}/mes`, data: row, details: [
          { label: "Saldo actual", value: money(balance.currentBalance) }, { label: "Principal pagado", value: money(balance.principalPaid) },
          { label: "Próximo pago", value: row.active ? nextScheduledPaymentDate(row.paymentDueDay, todayISO(), dataset.expenses.filter(e => e.obligationId === row.id).map(e => e.date)) ?? "Sin fecha" : "Cerrado" },
        ] };
      });
      defaults = { kind: "LOAN", active: true }; remove = true; break;
    case "maintenance":
      title = "Mantenimiento"; description = "Servicios y próximos vencimientos. El costo se registra una sola vez en los gastos.";
      fields = [truck(), choice("type", "Servicio", MAINTENANCE_TYPES.map(t => ({ value: t.id, label: t.labelEs })), true), choice("basis", "Vence por", ["DATE", "MILEAGE", "BOTH"], true), date("serviceDate", "Fecha del servicio", true), number("odometer", "Odómetro"), number("cost", "Costo ($)", true), f("vendor", "Proveedor"), date("nextServiceDate", "Próxima fecha"), number("nextServiceOdometer", "Próximo odómetro"), toggle("recordAsExpense", "Registrar como gasto"), notes()];
      rows = dataset.maintenanceRecords.map(row => ({ id: row.id, title: MAINTENANCE_TYPES.find(t => t.id === row.type)?.labelEs ?? row.type, subtitle: `${row.serviceDate} · ${money(row.cost)}`, data: { ...row, recordAsExpense: Boolean(row.expenseId) } }));
      defaults = { serviceDate: todayISO(), type: "OIL_CHANGE", basis: "BOTH", cost: 0, recordAsExpense: true }; remove = true; break;
    case "trucks":
      title = "Camiones"; description = "Datos del camión, odómetro, referencia de consumo y alcance IFTA.";
      fields = [f("name", "Nombre", "text", true), date("acquiredOn", "Fecha de compra"), number("year", "Año"), f("make", "Marca"), f("model", "Modelo"), f("vin", "VIN"), number("purchasePrice", "Precio de compra ($)"), number("monthlyPayment", "Pago mensual ($)"), number("monthlyInsurance", "Seguro mensual ($)"), number("referenceMpg", "MPG de referencia"), number("startingOdometer", "Odómetro inicial", true), number("currentOdometer", "Odómetro actual", true), number("axleCount", "Ejes"), number("registeredGrossWeightLbs", "Peso registrado (lb)"), choice("operatesInMultipleIftaJurisdictions", "Opera en varias jurisdicciones", ["true", "false"]), choice("iftaReportingEnabled", "Incluir en IFTA", ["true", "false"])];
      rows = dataset.trucks.map(row => ({ id: row.id, title: row.name, subtitle: `${row.active ? "Activo" : "Retirado"} · ${row.currentOdometer.toLocaleString()} mi`, data: row }));
      defaults = { startingOdometer: 0, currentOdometer: 0 }; break;
    case "reserve-buckets":
      title = "Cubetas de reserva"; description = "Porcentajes, base de cálculo y metas de cada reserva.";
      fields = [f("name", "Nombre", "text", true), choice("kind", "Tipo", ["TAX", "MAINTENANCE", "EMERGENCY", "CUSTOM"], true), choice("basis", "Base", ["OPERATING_PROFIT", "GROSS_REVENUE"], true), number("contributionPct", "Contribución (%)"), number("targetBalance", "Meta ($)"), toggle("active", "Activa")];
      rows = dataset.reserveAccounts.map(row => ({ id: row.id, title: row.name, subtitle: row.active ? "Activa" : "Inactiva", data: row }));
      defaults = { kind: "CUSTOM", basis: "GROSS_REVENUE", active: true }; remove = true; break;
    case "settings":
      title = "Negocio y finanzas"; description = "Las preferencias financieras se comparten con la web.";
      fields = [f("businessName", "Nombre del negocio", "text", true), f("currency", "Moneda", "text", true), number("taxReservePct", "Reserva de impuestos (%)", true), number("maintenanceReservePct", "Reserva de mantenimiento (%)", true), number("ratingGreatPerMile", "Great: ganancia por milla", true), number("ratingGoodPerMile", "Good: ganancia por milla", true), number("ratingMarginalPerMile", "Marginal: ganancia por milla", true), number("deadheadWarnPct", "Alerta de millas vacías (%)", true), number("maintenanceWarnMiles", "Alerta de servicio (millas)", true), number("maintenanceWarnDays", "Alerta de servicio (días)", true), choice("fleetOverheadAllocation", "Gastos compartidos", ["UNALLOCATED", "FLEET_MILES"]), ...EXPENSE_CATEGORIES.map(c => choice(`categoryBehavior.${c.id}`, c.labelEs, ["FIXED", "VARIABLE"], false, "Categorías de gastos"))];
      rows = [{ id: "settings", title: dataset.business.name, data: { ...dataset.settings, businessName: dataset.business.name, currency: dataset.business.currency } }]; create = false; break;
    case "goals":
      title = "Metas"; description = "Objetivos de ingresos, ganancia, actividad y millas.";
      fields = [number("monthlyRevenueTarget", "Ingresos mensuales ($)", true), number("monthlyProfitTarget", "Ganancia mensual ($)", true), number("targetProfitPerMile", "Ganancia por milla ($)", true), number("maxDeadheadPct", "Máximo de millas vacías (%)", true), number("targetLoads", "Cargas por mes"), number("workingDaysPerWeek", "Días por semana", true), number("expectedMonthlyMiles", "Millas mensuales", true)];
      rows = [{ id: "goals", title: "Metas del negocio", data: dataset.goals }]; create = false; break;
    case "drivers":
      title = "Choferes"; description = "Datos y acuerdos de pago. Un chofer no obtiene acceso a la app.";
      fields = [f("name", "Nombre", "text", true), f("reference", "Referencia"), truck("defaultTruckId"), choice("payType", "Forma de pago", ["PERCENT_GROSS", "PER_LOADED_MILE", "PER_TOTAL_MILE", "FLAT_PER_LOAD"], true), number("payRate", "Tarifa de pago", true), toggle("isOwnerOperator", "Owner-operator")];
      rows = dataset.drivers.map(row => ({ id: row.id, title: row.name, subtitle: `${row.active ? "Activo" : "Retirado"} · ${row.payRate} ${row.payType === "PERCENT_GROSS" ? "%" : "$"}`, data: row }));
      defaults = { payType: "PERCENT_GROSS", isOwnerOperator: false }; break;
    case "ifta-rates": {
      title = "Tarifas IFTA"; description = "Introduce las tarifas oficiales del trimestre. Deja vacías las que todavía no conoces.";
      fields = [f("quarter", "Trimestre (YYYY-Q1)", "text", true), ...IFTA_JURISDICTIONS.map(code => number(`rates.${code}`, `${code} · impuesto por galón ($)`, false, "Tarifas"))];
      const rates = Object.fromEntries(IFTA_JURISDICTIONS.map(code => [code, dataset.settings.iftaTaxRates?.[iftaRateKey(quarter, code)]]));
      rows = [{ id: quarter, title: quarter, data: { quarter, rates } }]; create = false; break;
    }
    case "ifta-mileage":
      title = "Millas IFTA"; description = "Distribuye las millas reales de cada carga entre jurisdicciones; no se infieren rutas.";
      fields = IFTA_JURISDICTIONS.flatMap(code => [number(`mileage.${code}.totalMiles`, `${code} · millas totales`, false, code), number(`mileage.${code}.nonTaxableMiles`, `${code} · millas no gravables`, false, code)]);
      rows = dataset.loads.map(row => ({ id: row.id, title: `${row.originCity} → ${row.destinationCity}`, subtitle: `${row.date} · ${row.loadedMiles + row.deadheadMiles} mi`, data: { mileage: Object.fromEntries((row.jurisdictionMiles ?? []).map(m => [m.jurisdiction, m])) } }));
      create = false; break;
    case "debt-payments":
      title = "Clasificar pagos"; description = "Vincula pagos de préstamo pendientes y separa principal e intereses sin duplicar el gasto.";
      fields = [choice("obligationId", "Obligación", dataset.financialObligations.map(row => ({ value: row.id, label: row.name }))), choice("treatment", "Tratamiento", ["OPERATING_LEASE", "LOAN_SPLIT", "DEBT_UNALLOCATED"], true), number("principalAmount", "Principal ($)"), number("interestAmount", "Interés ($)")];
      rows = dataset.expenses.filter(row => row.category === "TRUCK_PAYMENT" && !row.splitGroupId).map(row => ({ id: row.id, title: row.description, subtitle: `${row.date} · ${money(row.amount)}`, data: { obligationId: row.obligationId, treatment: "DEBT_UNALLOCATED" } }));
      create = false; break;
  }
  const capability = managementCapability(resource);
  const permitted = roleCan(role, permissions[resource]);
  const write = canWrite(dataset.subscription, todayISO());
  const plan = !capability || planAllows(dataset.subscription, capability);
  const canEdit = permitted && write && plan;
  return { title, description, fields, scanAvailable: resource === "loads" && canEdit && isRateConScanConfigured(), records: rows.map(row => ({ id: row.id, title: row.title, subtitle: row.subtitle ?? "", values: valuesFor(row.data, fields), details: row.details ?? [] })), defaults: valuesFor(defaults, fields), canCreate: canEdit && create, canEdit: canEdit && resource !== "reserve-movements", canDelete: canEdit && remove,
    refusal: !permitted ? "Tu rol permite consultar esta sección, pero no modificarla." : !plan ? "Esta función requiere OnRoad Pro." : !write ? "La suscripción necesita atención. Puedes consultar los registros existentes." : null };
}

export const managementWriteSchema = z.object({
  id: z.string().min(1).max(300).nullable(),
  values: z.record(z.string().max(150), z.string().max(5000)).refine(v => Object.keys(v).length <= 200),
});

// Only catalog fields are accepted. Empty optional numbers stay unknown, never
// zero. Nested paths come from the server catalog, never from an arbitrary key.
export function decodeNativeValues(fields: NativeField[], values: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field.key in values)) continue;
    const raw = values[field.key].trim();
    let value: unknown = raw || (field.required ? "" : null);
    if (raw && field.kind === "number") value = Number.isFinite(Number(raw)) ? Number(raw) : raw;
    if ((field.kind === "toggle" || ["iftaReportingEnabled", "operatesInMultipleIftaJurisdictions"].includes(field.key)) && raw) value = raw === "true" ? true : raw === "false" ? false : raw;
    const parts = field.key.split(".");
    let target = result;
    for (const part of parts.slice(0, -1)) target = (target[part] ??= {}) as Record<string, unknown>;
    target[parts.at(-1)!] = value;
  }
  return result;
}

export async function saveManagement(repository: Repository, resource: ResourceId, input: z.infer<typeof managementWriteSchema>) {
  const dataset = await repository.getDataset();
  const collection = managementCollection(resource, dataset, "OWNER", resource === "ifta-rates" ? input.id ?? undefined : undefined);
  const row = input.id ? collection.records.find(row => row.id === input.id) : null;
  if (input.id && !row) throw new Error("El registro ya no existe en este negocio. Actualiza la lista.");
  if (!input.id && ["settings", "goals", "ifta-rates", "ifta-mileage", "debt-payments", "invoices", "broker-merge", "truck-status", "truck-planning"].includes(resource)) throw new Error("Selecciona un registro existente.");
  const values = decodeNativeValues(collection.fields, { ...(row?.values ?? collection.defaults), ...input.values });
  const id = input.id;
  switch (resource) {
    case "broker-contacts": {
      const brokerId = z.string().min(1).parse(values.brokerId);
      const broker = (dataset.brokers ?? []).find(b => b.id === brokerId);
      if (!broker) throw new Error("Selecciona un broker de este negocio.");
      const original = id ? collection.records.find(r => r.id === id) : null;
      if (original && original.values.brokerId !== brokerId) throw new Error("No se puede cambiar el broker de un contacto existente.");
      const contactId = id ? id.slice(brokerId.length + 1) : `bc_${crypto.randomUUID()}`;
      const contact = brokerContactSchema.parse({ ...values, id: contactId });
      const contacts = brokerContactsOf(broker).filter(c => c.id !== contactId);
      await repository.saveBrokerContacts(brokerId, brokerContactsSchema.parse([...contacts, contact]));
      return `${brokerId}:${contactId}`;
    }
    case "broker-merge": {
      const targetId = z.string().min(1).parse(values.targetId);
      if (!(dataset.brokers ?? []).some(b => b.id === targetId)) throw new Error("El destino no pertenece a este negocio.");
      if (!id || id === targetId) throw new Error("Elige otro broker como destino.");
      if (id.startsWith("name:")) await repository.moveBrokerName(id.slice(5), targetId);
      else await repository.mergeBroker(id, targetId);
      return targetId;
    }
    case "truck-status": {
      const parsed = z.object({ active: z.boolean(), soldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).parse(values);
      if (parsed.active) {
        if (!dataset.trucks.find(t => t.id === id)?.active) {
          const allowance = truckAllowance(dataset.subscription, activeTrucks(dataset.trucks).length);
          if (!allowance.canAdd) throw new Error(allowance.reason ?? "El plan no admite otro camión.");
          await repository.restoreTruck(id!);
        }
      } else await repository.archiveTruck(id!, parsed.soldOn);
      return id!;
    }
    case "truck-planning": {
      const confirmation = truckFinancingConfirmationSchema.parse({ truckId: id, confirmedNone: values.confirmedNone });
      const raw = values.exemptions as Record<string, unknown>;
      const profile = truckOperatingCostExemptionsSchema.parse({ truckId: id, exemptions: Object.fromEntries(Object.entries(raw).filter(([, v]) => v === true)) });
      const truck = dataset.trucks.find(t => t.id === id)!;
      if (confirmation.confirmedNone && ((truck.monthlyPayment ?? 0) > 0 || dataset.financialObligations.some(o => o.truckId === id && o.active))) throw new Error("Cierra el financiamiento activo antes de confirmar que no tiene deuda.");
      await repository.setTruckFinancingConfirmedNone(id!, confirmation.confirmedNone ? true : null);
      await repository.setTruckOperatingCostExemptions(id!, profile.exemptions);
      return id!;
    }
    case "reserve-movements": {
      if (id) throw new Error("Para corregir un movimiento, elimínalo y registra el correcto.");
      return (await repository.createReserveTransaction(reserveTransactionSchema.parse(values))).id;
    }
    case "loads": {
      const current = dataset.loads.find(row => row.id === id);
      const parsed = loadSchema.parse({ ...current, ...values });
      return (id ? await repository.updateLoad(id, parsed) : await repository.createLoad(parsed)).id;
    }
    case "invoices": {
      const load = dataset.loads.find(row => row.id === id);
      if (!load) throw new Error("Selecciona una carga.");
      const parsed = invoiceSchema.parse(values);
      if (duplicateInvoiceNumber(dataset.loads, load.id, parsed.invoiceNumber)) throw new Error("Ese número de factura ya existe.");
      await repository.updateLoad(load.id, { ...load, ...invoiceIssuePatch(load, parsed) });
      return load.id;
    }
    case "brokers": {
      const parsed = brokerSchema.parse(values);
      const profileId = id?.startsWith("name:") ? null : id;
      if ((dataset.brokers ?? []).some(row => row.nameKey === brokerNameKey(parsed.name) && row.id !== profileId)) throw new Error("Ya existe un broker con ese nombre.");
      return (await repository.saveBroker(profileId, parsed)).id;
    }
    case "dispatchers": return (await repository.saveDispatcher(id?.startsWith("name:") ? null : id, dispatcherSchema.parse(values))).id;
    case "financing": {
      const parsed = financialObligationSchema.parse(values);
      return (id ? await repository.updateFinancialObligation(id, parsed) : await repository.createFinancialObligation(parsed)).id;
    }
    case "maintenance": {
      const parsed = maintenanceSchema.parse(values);
      // The shared schema enumerates the exact MaintenanceType ids.
      const data = parsed as Parameters<Repository["createMaintenance"]>[0];
      return (id ? await repository.updateMaintenance(id, data) : await repository.createMaintenance(data)).id;
    }
    case "trucks": {
      const parsed = truckSchema.parse(values);
      if (!id) {
        const allowance = truckAllowance(dataset.subscription, activeTrucks(dataset.trucks).length);
        if (!allowance.canAdd) throw new Error(allowance.reason ?? "El plan no admite otro camión.");
      }
      return (id ? await repository.updateTruck(parsed, id) : await repository.createTruck(parsed)).id;
    }
    case "reserve-buckets": {
      const parsed = reserveAccountSchema.parse(values);
      return (id ? await repository.updateReserveAccount(id, parsed) : await repository.createReserveAccount(parsed)).id;
    }
    case "settings": {
      const categoryBehavior = values.categoryBehavior as Record<string, unknown>;
      values.categoryBehavior = Object.fromEntries(Object.entries(categoryBehavior ?? {}).filter(([, v]) => v != null));
      const { businessName, currency, ...settings } = settingsSchema.parse(values);
      await repository.updateBusiness({ name: businessName, currency: currency.toUpperCase() });
      await repository.updateSettings(settings);
      return "settings";
    }
    case "goals": await repository.updateGoals(goalSchema.parse(values)); return "goals";
    case "drivers": {
      const parsed = driverSchema.parse(values);
      return (id ? await repository.updateDriver(id, parsed) : await repository.createDriver(parsed)).id;
    }
    case "ifta-rates": {
      const rates = values.rates as Record<string, unknown>;
      const parsed = iftaRatesSchema.parse({ ...values, rates: Object.fromEntries(Object.entries(rates).filter(([, v]) => v != null)) });
      if (parsed.quarter !== id) throw new Error("Selecciona el trimestre antes de editar sus tarifas.");
      const next = { ...dataset.settings.iftaTaxRates };
      for (const code of IFTA_JURISDICTIONS) {
        const key = iftaRateKey(parsed.quarter, code);
        if (parsed.rates[code] == null) delete next[key]; else next[key] = parsed.rates[code];
      }
      await repository.updateSettings({ ...dataset.settings, iftaTaxRates: next });
      return parsed.quarter;
    }
    case "ifta-mileage": {
      const mileage = values.mileage as Record<string, { totalMiles: unknown; nonTaxableMiles: unknown }>;
      const parsed = jurisdictionMilesSchema.parse(Object.entries(mileage).filter(([, m]) => m.totalMiles != null || m.nonTaxableMiles != null).map(([jurisdiction, m]) => ({ jurisdiction, totalMiles: m.totalMiles ?? 0, nonTaxableMiles: m.nonTaxableMiles ?? 0 })));
      return (await repository.updateLoadJurisdictionMiles(id!, parsed)).id;
    }
    case "debt-payments":
      await repository.classifyDebtPayment(id!, debtPaymentClassificationSchema.parse(values)); return id!;
  }
}

export async function deleteManagement(repository: Repository, resource: ResourceId, id: string) {
  const collection = managementCollection(resource, await repository.getDataset(), "OWNER");
  if (!collection.records.some(row => row.id === id)) throw new Error("El registro no pertenece a este negocio.");
  switch (resource) {
    case "broker-contacts": {
      const row = collection.records.find(r => r.id === id)!;
      const broker = (await repository.getDataset()).brokers?.find(b => b.id === row.values.brokerId);
      if (!broker) throw new Error("Broker no encontrado.");
      await repository.saveBrokerContacts(broker.id, brokerContactsOf(broker).filter(c => `${broker.id}:${c.id}` !== id)); break;
    }
    case "reserve-movements": await repository.deleteReserveTransaction(id); break;
    case "brokers": if (id.startsWith("name:")) throw new Error("Este nombre está en cargas. Crea el perfil antes de eliminarlo."); await repository.deleteBroker(id); break;
    case "financing": await repository.deleteFinancialObligation(id); break;
    case "maintenance": await repository.deleteMaintenance(id); break;
    case "reserve-buckets": await repository.deleteReserveAccount(id); break;
    default: throw new Error("Esta sección no permite eliminar registros.");
  }
}
