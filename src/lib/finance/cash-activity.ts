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
  _paymentEvents: PaymentEvent[],
  range: DateRange,
): CashActivity {
  // A reported load is already received income. Legacy payment events are
  // retained for history and must not count that income a second time.
  const collectedRevenue = roundMoney(
    sum(loads.filter((load) => inRange(load.date, range)), (load) => load.grossRate),
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
