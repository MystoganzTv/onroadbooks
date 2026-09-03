import { inRange } from "../periods";
import type {
  Expense,
  ExpenseCategoryId,
  OperatingCostExemptions,
  OperatingCostGroup,
} from "../types";
import type { CostPerMile } from "./cost-per-mile";
import { financialTreatmentOf } from "./terminology";

export const OPERATING_COST_GROUPS: readonly OperatingCostGroup[] = [
  "INSURANCE",
  "MAINTENANCE_REPAIRS",
  "PERMITS_REGISTRATION",
  "RECURRING_SERVICES",
] as const;

const GROUP_CATEGORIES: Record<OperatingCostGroup, readonly ExpenseCategoryId[]> = {
  INSURANCE: ["INSURANCE"],
  MAINTENANCE_REPAIRS: ["MAINTENANCE", "REPAIRS"],
  PERMITS_REGISTRATION: ["PERMITS", "REGISTRATION"],
  RECURRING_SERVICES: ["OPERATING_LEASE", "PARKING", "ELD", "OFFICE", "PHONE", "ACCOUNTING"],
};

export type OperatingCostCoverageStatus = "RECORDED" | "NOT_APPLICABLE" | "UNKNOWN";

export interface OperatingCostCoverageItem {
  group: OperatingCostGroup;
  status: OperatingCostCoverageStatus;
}

/**
 * Evidence is intentionally tied to the same window used by Calculator.
 * An old expense outside that window cannot make a current normalized rate
 * look complete. Owners may explicitly mark a group not applicable, but a
 * missing group is never silently converted to $0.
 */
export function operatingCostCoverage(
  expenses: Expense[],
  basis: CostPerMile,
  exemptions: OperatingCostExemptions | undefined,
): OperatingCostCoverageItem[] {
  const range = basis.rangeStart && basis.rangeEnd
    ? { start: basis.rangeStart, end: basis.rangeEnd }
    : null;

  return OPERATING_COST_GROUPS.map((group) => {
    const recorded = expenses.some((expense) =>
      expense.amount > 0
      && financialTreatmentOf(expense) === "OPERATING"
      && GROUP_CATEGORIES[group].includes(expense.category)
      && (!range || inRange(expense.date, range)),
    );
    return {
      group,
      status: recorded
        ? "RECORDED"
        : exemptions?.[group]
          ? "NOT_APPLICABLE"
          : "UNKNOWN",
    };
  });
}

export function hasCompleteOperatingCostCoverage(
  coverage: OperatingCostCoverageItem[],
): boolean {
  return coverage.every((item) => item.status !== "UNKNOWN");
}
