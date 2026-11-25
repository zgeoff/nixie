import type { Transaction } from 'kysely';
import type { BudgetsTables } from '../types';
import { buildBudgetLedgerKey } from './build-budget-ledger-key';

export interface ChargedPayload {
  readonly chargeID: string;
  readonly budgetID: string;
  readonly periodStart: string;
  readonly ledgerKey?: string;
}

// A charge from before the ledger names no key, so it takes the kind that the migration kept for
// it, whatever the budget has become since. With no kept kind it gets none, and counts nowhere: the
// budget's period now can differ from the one it was charged under.
export async function readChargeLedgerKey(
  tx: Transaction<unknown>,
  payload: ChargedPayload,
): Promise<string | null> {
  if (payload.ledgerKey !== undefined) {
    return payload.ledgerKey;
  }

  const kept = await tx
    .$extendTables<BudgetsTables>()
    .selectFrom('legacy_charge_kinds')
    .select('period_kind')
    .where('charge_id', '=', payload.chargeID)
    .executeTakeFirst();

  const kind = kept?.period_kind;

  if (kind !== 'day' && kind !== 'week' && kind !== 'month') {
    return null;
  }

  return buildBudgetLedgerKey(payload.budgetID, { kind, start: payload.periodStart });
}
