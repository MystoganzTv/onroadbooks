import { roundMoney } from "../calculations";

export type DebtSplitState = "BALANCED" | "UNDER" | "OVER" | "INVALID";

export interface DebtSplitReconciliation {
  payment: number;
  principal: number;
  interest: number;
  entered: number;
  difference: number;
  state: DebtSplitState;
}

/** Reconcile a principal/interest split in cents before any ledger row changes. */
export function reconcileDebtPaymentSplit(
  paymentAmount: number,
  principalAmount: number,
  interestAmount: number,
): DebtSplitReconciliation {
  const valid = [paymentAmount, principalAmount, interestAmount].every(Number.isFinite)
    && paymentAmount >= 0
    && principalAmount >= 0
    && interestAmount >= 0;
  const payment = roundMoney(paymentAmount);
  const principal = roundMoney(principalAmount);
  const interest = roundMoney(interestAmount);
  const entered = roundMoney(principal + interest);
  const difference = roundMoney(payment - entered);

  return {
    payment,
    principal,
    interest,
    entered,
    difference,
    state: !valid ? "INVALID" : difference === 0 ? "BALANCED" : difference > 0 ? "UNDER" : "OVER",
  };
}

/** Server-side invariant shared by every persistence implementation. */
export function requireExactDebtPaymentSplit(
  paymentAmount: number,
  principalAmount: number,
  interestAmount: number,
): DebtSplitReconciliation {
  const reconciliation = reconcileDebtPaymentSplit(
    paymentAmount,
    principalAmount,
    interestAmount,
  );
  if (reconciliation.state === "BALANCED") return reconciliation;
  if (reconciliation.state === "UNDER") {
    throw new Error(
      `Principal plus interest is $${reconciliation.difference.toFixed(2)} short of the $${reconciliation.payment.toFixed(2)} payment.`,
    );
  }
  if (reconciliation.state === "OVER") {
    throw new Error(
      `Principal plus interest is $${Math.abs(reconciliation.difference).toFixed(2)} over the $${reconciliation.payment.toFixed(2)} payment.`,
    );
  }
  throw new Error("Principal and interest must be valid non-negative amounts.");
}
