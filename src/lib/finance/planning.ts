import { div, roundMoney, sum } from "../calculations";
import type { FinancialGoal, FinancialObligation } from "../types";
import type { CostPerMile } from "./cost-per-mile";
import { FINANCIAL_MODEL_VERSION } from "./terminology";

export interface FinancialPlanningSummary {
  calculationVersion: number;
  expectedMonthlyMiles: number;
  normalizedCostPerMile: number;
  expectedOperatingCosts: number;
  activeMonthlyObligations: number;
  operatingBreakEvenRevenue: number;
  cashBreakEvenRevenue: number;
  fixedObligationCoverage: number;
}

export function calculateFinancialPlanning(
  goals: FinancialGoal,
  costBasis: CostPerMile,
  obligations: FinancialObligation[],
): FinancialPlanningSummary {
  const expectedMonthlyMiles = Math.max(0, goals.expectedMonthlyMiles ?? 0);
  const normalizedCostPerMile = costBasis.actualCostPerMile;
  const expectedOperatingCosts = roundMoney(expectedMonthlyMiles * normalizedCostPerMile);
  const activeMonthlyObligations = roundMoney(
    sum(
      obligations.filter((obligation) => obligation.active),
      (obligation) => obligation.expectedMonthlyPayment ?? 0,
    ),
  );
  const operatingCashBeforeFinancing = Math.max(
    0,
    roundMoney(goals.monthlyRevenueTarget - expectedOperatingCosts),
  );
  return {
    calculationVersion: FINANCIAL_MODEL_VERSION,
    expectedMonthlyMiles,
    normalizedCostPerMile,
    expectedOperatingCosts,
    activeMonthlyObligations,
    operatingBreakEvenRevenue: expectedOperatingCosts,
    cashBreakEvenRevenue: roundMoney(expectedOperatingCosts + activeMonthlyObligations),
    fixedObligationCoverage: div(operatingCashBeforeFinancing, activeMonthlyObligations),
  };
}
