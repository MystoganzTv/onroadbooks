import { getAuthStore, getRepository } from "@/lib/db";
import { canWrite } from "@/lib/plans";
import { todayISO } from "@/lib/periods";
import { dueRecurringExpenses } from "@/lib/recurring-expenses";

export interface RecurringPostingResult {
  /** The day the run was made for, so a replay is obvious in the logs. */
  today: string;
  businessesScanned: number;
  businessesPosted: number;
  expensesPosted: number;
  skippedNotWritable: number;
  failures: { businessId: string; message: string }[];
}

/**
 * Posts this month's fixed costs -- the truck note, insurance, and any expense
 * the owner marked as recurring -- into every workspace that is due one.
 *
 * Three rules keep this safe to run unattended:
 *
 *  1. CURRENT MONTH ONLY. A closed month is never touched. Backfilling is how
 *     you silently move a settled month's profit, so the job simply cannot.
 *  2. ONLY WHAT IS DUE. A cost dated the 15th posts on the 15th, not on the
 *     1st, so the ledger never claims money left the account before it did.
 *  3. NOTHING TWICE. Each run re-reads the workspace, and a cost already
 *     present for the month is not a suggestion any more, so a replay -- or
 *     two runs in one day -- adds nothing.
 *
 * A workspace whose billing has lapsed is skipped: writing is closed there,
 * and the job must not do what the owner is not allowed to do by hand.
 * Failures are collected per business so one bad workspace cannot stop the
 * rest from being posted.
 */
export async function postDueRecurringExpenses(
  today: string = todayISO(),
): Promise<RecurringPostingResult> {
  const month = today.slice(0, 7);
  const result: RecurringPostingResult = {
    today,
    businessesScanned: 0,
    businessesPosted: 0,
    expensesPosted: 0,
    skippedNotWritable: 0,
    failures: [],
  };

  const accounts = await getAuthStore().listAccounts();

  for (const account of accounts) {
    result.businessesScanned += 1;
    try {
      const repository = getRepository(account.businessId);
      const dataset = await repository.getDataset();

      if (!canWrite(dataset.subscription, today)) {
        result.skippedNotWritable += 1;
        continue;
      }

      const due = dueRecurringExpenses(dataset, month, today);
      if (due.length === 0) continue;

      for (const suggestion of due) {
        await repository.createExpense({
          ...suggestion,
          notes: suggestion.notes
            ? `${suggestion.notes} Posted automatically on ${today}.`
            : `Posted automatically on ${today} from your monthly fixed costs.`,
        });
        result.expensesPosted += 1;
      }
      result.businessesPosted += 1;
    } catch (error) {
      result.failures.push({
        businessId: account.businessId,
        message: error instanceof Error ? error.message : "Unknown failure",
      });
    }
  }

  return result;
}
