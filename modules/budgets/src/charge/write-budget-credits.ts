import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { budgetCreditedCodec } from '../record/budget-credited-codec';
import type { BudgetsContext } from '../types';

export async function writeBudgetCredits(
  tx: Transaction<unknown>,
  context: BudgetsContext,
  chargeIDs: readonly string[],
): Promise<void> {
  if (chargeIDs.length === 0) {
    return;
  }

  await writeRecordsInTransaction(
    tx,
    context.log,
    chargeIDs.map((chargeID) => ({
      kind: budgetCreditedCodec.kind,
      definitions: context.definitions(),
      payload: budgetCreditedCodec.encode({ chargeID }),
    })),
  );
}
