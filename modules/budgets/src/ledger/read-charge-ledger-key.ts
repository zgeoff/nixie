import type { Transaction } from 'kysely';
import type { BudgetsTables } from '../types';
import { buildBudgetLedgerKey } from './build-budget-ledger-key';
import { pickLedgerPeriodKind } from './pick-ledger-period-kind';

export interface ChargedPayload {
  readonly budgetID: string;
  readonly periodStart: string;
  readonly ledgerKey?: string;
}

// The ledger key of a charge. A charge from before the ledger names none, so its key takes the
// period kind of the budget in force, the same rule that the migration applies to the stored
// charges.
export async function readChargeLedgerKey(
  tx: Transaction<unknown>,
  payload: ChargedPayload,
): Promise<string> {
  if (payload.ledgerKey !== undefined) {
    return payload.ledgerKey;
  }

  const row = await tx
    .$extendTables<BudgetsTables>()
    .selectFrom('budgets_in_force')
    .select('period')
    .where('budget_id', '=', payload.budgetID)
    .executeTakeFirst();

  const kind = pickLedgerPeriodKind(row?.period, payload.budgetID);

  return buildBudgetLedgerKey(payload.budgetID, { kind, start: payload.periodStart });
}
