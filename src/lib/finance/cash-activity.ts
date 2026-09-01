import { roundMoney, sum } from "../calculations";
import { inRange, type DateRange } from "../periods";
import type { Expense, Load, PaymentEvent } from "../types";
import { financialTreatmentOf } from "./terminology";
import { FINANCIAL_MODEL_VERSION } from "./terminology";

export interface CashActivity {
  calculationVersion: number;
  collectedRevenue: number;
  operatingCashOutflows: number;
  interestExpense: number;
  principalPayment: number;
  unallocatedDebtService: number;
  debtService: number;
  netCashActivity: number;
}

export function calculateCashActivity(
  loads: Load[],
  expenses: Expense[],
  paymentEvents: PaymentEvent[],
  range: DateRange,
): CashActivity {
  const includedLoadIds = new Set(loads.map((load) => load.id));
  const relevantEvents = paymentEvents.filter((event) => includedLoadIds.has(event.loadId));
  const eventLoadIds = new Set(relevantEvents.map((event) => event.loadId));
  const collectedRevenue = roundMoney(
    sum(relevantEvents.filter((event) => inRange(event.date, range)), (event) => event.amount) +
      sum(
        loads.filter(
          (load) =>
            !eventLoadIds.has(load.id) &&
            load.status === "PAID" &&
            Boolean(load.invoicePaidDate) &&
            inRange(load.invoicePaidDate!, range),
        ),
        (load) => load.grossRate,
      ),
  );
  const rows = expenses.filter((expense) => inRange(expense.date, range));
  const totalFor = (treatment: ReturnType<typeof financialTreatmentOf>) =>
    roundMoney(sum(rows.filter((expense) => financialTreatmentOf(expense) === treatment), (expense) => expense.amount));
  const operatingCashOutflows = totalFor("OPERATING");
  const interestExpense = totalFor("INTEREST");
  const principalPayment = totalFor("PRINCIPAL");
  const unallocatedDebtService = totalFor("DEBT_UNALLOCATED");
  const debtService = roundMoney(interestExpense + principalPayment + unallocatedDebtService);
  return {
    calculationVersion: FINANCIAL_MODEL_VERSION,
    collectedRevenue,
    operatingCashOutflows,
    interestExpense,
    principalPayment,
    unallocatedDebtService,
    debtService,
    netCashActivity: roundMoney(collectedRevenue - operatingCashOutflows - debtService),
  };
}
