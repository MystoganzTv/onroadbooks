import { roundMoney } from "./calculations";
import type {
  Driver,
  DriverPayType,
  DriverSettlement,
  Load,
} from "./types";

export const DRIVER_PAY_TYPES: {
  id: DriverPayType;
  label: string;
  rateLabel: string;
  suffix: string;
}[] = [
  {
    id: "PERCENT_GROSS",
    label: "Percent of gross",
    rateLabel: "Percent",
    suffix: "% of load revenue",
  },
  {
    id: "PER_LOADED_MILE",
    label: "Per loaded mile",
    rateLabel: "Rate per loaded mile",
    suffix: "/ loaded mi",
  },
  {
    id: "PER_TOTAL_MILE",
    label: "Per total mile",
    rateLabel: "Rate per total mile",
    suffix: "/ total mi",
  },
  {
    id: "FLAT_PER_LOAD",
    label: "Flat per load",
    rateLabel: "Amount per load",
    suffix: "per load",
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

export function driverPayDescription(driver: Pick<Driver, "payType" | "payRate">): string {
  const definition = DRIVER_PAY_TYPES.find((type) => type.id === driver.payType)!;
  if (driver.payType === "PERCENT_GROSS") return `${driver.payRate}% of gross`;
  return `$${driver.payRate.toFixed(2)} ${definition.suffix}`;
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
  return settlement.lines.reduce(
    (total, line) => ({
      loads: total.loads + 1,
      grossRevenue: roundMoney(total.grossRevenue + line.grossRevenue),
      totalMiles: total.totalMiles + line.totalMiles,
      payAmount: roundMoney(total.payAmount + line.payAmount),
    }),
    { loads: 0, grossRevenue: 0, totalMiles: 0, payAmount: 0 },
  );
}
