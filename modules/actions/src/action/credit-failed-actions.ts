import type { BudgetsContext } from '@heynixie/budgets';
import { creditBudgetChargesInTransaction } from '@heynixie/budgets';
import type { RecordInput } from '@heynixie/log';
import type { Transaction } from 'kysely';

// A failed action never spent what its lift charged, so it gives the charge back in the transaction
// that writes the failure. An action that settled done, or unknown, keeps it.
export async function creditFailedActions(
  tx: Transaction<unknown>,
  budgets: BudgetsContext | undefined,
  records: readonly RecordInput[],
): Promise<void> {
  if (budgets === undefined) {
    return;
  }

  for (const actionID of collectFailedActionIDs(records)) {
    await creditBudgetChargesInTransaction(tx, budgets, { for: { kind: 'action', id: actionID } });
  }
}

function collectFailedActionIDs(records: readonly RecordInput[]): readonly string[] {
  return records.flatMap((record) => {
    const actionID = record.payload?.['actionID'];

    return record.kind === 'action.outcome' &&
      record.payload?.['status'] === 'failed' &&
      typeof actionID === 'string'
      ? [actionID]
      : [];
  });
}
