import { roundMoney } from "./calculations";
import type { AppLocale } from "./i18n";
import type {
  Driver,
  DriverPayType,
  DriverSettlement,
  DriverSettlementAdjustment,
  DriverSettlementAdjustmentType,
  Load,
} from "./types";

export const DRIVER_PAY_TYPES: {
  id: DriverPayType;
  label: string;
  labelEs: string;
  rateLabel: string;
  rateLabelEs: string;
  suffix: string;
  suffixEs: string;
}[] = [
  {
    id: "PERCENT_GROSS",
    label: "Percent of gross",
    labelEs: "Porcentaje del bruto",
    rateLabel: "Percent",
    rateLabelEs: "Porcentaje",
    suffix: "% of load revenue",
    suffixEs: "% del ingreso de la carga",
  },
  {
    id: "PER_LOADED_MILE",
    label: "Per loaded mile",
    labelEs: "Por milla cargada",
    rateLabel: "Rate per loaded mile",
    rateLabelEs: "Tarifa por milla cargada",
    suffix: "/ loaded mi",
    suffixEs: "/ milla cargada",
  },
  {
    id: "PER_TOTAL_MILE",
    label: "Per total mile",
    labelEs: "Por milla total",
    rateLabel: "Rate per total mile",
    rateLabelEs: "Tarifa por milla total",
    suffix: "/ total mi",
    suffixEs: "/ milla total",
  },
  {
    id: "FLAT_PER_LOAD",
    label: "Flat per load",
    labelEs: "Fijo por carga",
    rateLabel: "Amount per load",
    rateLabelEs: "Importe por carga",
    suffix: "per load",
    suffixEs: "por carga",
  },
];

export function calculateDriverPay(
  payType: DriverPayType,
  payRate: number,
  load: Pick<Load, "grossRate" | "loadedMiles" | "deadheadMiles">,
): number {
  switch (payType) {
    case "PERCENT_GROSS":
      return roundMoney(load.grossRate * (payRate / 100));
    case "PER_LOADED_MILE":
      return roundMoney(load.loadedMiles * payRate);
    case "PER_TOTAL_MILE":
      return roundMoney((load.loadedMiles + load.deadheadMiles) * payRate);
    case "FLAT_PER_LOAD":
      return roundMoney(payRate);
  }
}

export function driverPayDescription(driver: Pick<Driver, "payType" | "payRate">, locale: AppLocale = "en"): string {
  const definition = DRIVER_PAY_TYPES.find((type) => type.id === driver.payType)!;
  if (driver.payType === "PERCENT_GROSS") return locale === "es" ? `${driver.payRate}% del bruto` : `${driver.payRate}% of gross`;
  return `$${driver.payRate.toFixed(2)} ${locale === "es" ? definition.suffixEs : definition.suffix}`;
}

export function unsettledLoadsForDriver(
  loads: Load[],
  settlements: DriverSettlement[],
  driverId: string,
): Load[] {
  const attached = new Set(
    settlements.flatMap((settlement) => settlement.lines.map((line) => line.loadId)),
  );
  return loads.filter((load) => load.driverId === driverId && !attached.has(load.id));
}

export function driverSettlementTotals(settlement: DriverSettlement) {
  const loadTotals = settlement.lines.reduce(
    (total, line) => ({
      loads: total.loads + 1,
      grossRevenue: roundMoney(total.grossRevenue + line.grossRevenue),
      totalMiles: total.totalMiles + line.totalMiles,
      basePay: roundMoney(total.basePay + line.payAmount),
    }),
    { loads: 0, grossRevenue: 0, totalMiles: 0, basePay: 0 },
  );
  const adjustments = settlement.adjustments ?? [];
  const accessorialPay = adjustmentTotal(adjustments, "ACCESSORIAL_PAY");
  const reimbursements = adjustmentTotal(adjustments, "REIMBURSEMENT");
  const otherEarnings = adjustmentTotal(adjustments, "OTHER_EARNING");
  const deductions = adjustmentTotal(adjustments, "DEDUCTION");
  const advances = adjustmentTotal(adjustments, "ADVANCE");
  const additions = roundMoney(accessorialPay + reimbursements + otherEarnings);
  const reductions = roundMoney(deductions + advances);
  const netPay = roundMoney(loadTotals.basePay + additions - reductions);

  return {
    ...loadTotals,
    accessorialPay,
    reimbursements,
    otherEarnings,
    deductions,
    advances,
    additions,
    reductions,
    netPay,
    /** Backward-compatible name used by existing summaries. It now means net pay. */
    payAmount: netPay,
    payPerLoad: loadTotals.loads > 0 ? roundMoney(netPay / loadTotals.loads) : 0,
    payPerMile: loadTotals.totalMiles > 0 ? roundMoney(netPay / loadTotals.totalMiles) : 0,
  };
}

export const DRIVER_ADJUSTMENT_TYPES: {
  id: DriverSettlementAdjustmentType;
  label: string;
  labelEs: string;
  direction: "ADD" | "SUBTRACT";
}[] = [
  { id: "ACCESSORIAL_PAY", label: "Accessorial pay", labelEs: "Pago adicional", direction: "ADD" },
  { id: "REIMBURSEMENT", label: "Reimbursement", labelEs: "Reembolso", direction: "ADD" },
  { id: "OTHER_EARNING", label: "Other earning", labelEs: "Otro ingreso", direction: "ADD" },
  { id: "DEDUCTION", label: "Deduction", labelEs: "Deducción", direction: "SUBTRACT" },
  { id: "ADVANCE", label: "Advance", labelEs: "Adelanto", direction: "SUBTRACT" },
];

export function adjustmentDirection(type: DriverSettlementAdjustmentType): 1 | -1 {
  return type === "DEDUCTION" || type === "ADVANCE" ? -1 : 1;
}

export function adjustmentTotal(
  adjustments: DriverSettlementAdjustment[],
  type: DriverSettlementAdjustmentType,
): number {
  return roundMoney(
    adjustments.reduce((sum, adjustment) =>
      adjustment.type === type ? sum + adjustment.amount : sum, 0),
  );
}

/**
 * Allocates final net pay back to frozen load lines without losing a cent.
 * This keeps load profitability and the paid statement on the same total.
 */
export function allocateDriverSettlementNetPay(settlement: DriverSettlement): Map<string, number> {
  const totals = driverSettlementTotals(settlement);
  const allocations = new Map<string, number>();
  if (settlement.lines.length === 0) return allocations;
  if (totals.netPay < 0) throw new Error("Net pay cannot be negative.");

  let allocated = 0;
  settlement.lines.forEach((line, index) => {
    const last = index === settlement.lines.length - 1;
    const share = totals.basePay > 0
      ? line.payAmount / totals.basePay
      : 1 / settlement.lines.length;
    const amount = last ? roundMoney(totals.netPay - allocated) : roundMoney(totals.netPay * share);
    allocations.set(line.id, amount);
    allocated = roundMoney(allocated + amount);
  });
  return allocations;
}
