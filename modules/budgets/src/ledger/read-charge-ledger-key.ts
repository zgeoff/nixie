import type { Transaction } from 'kysely';
import type { BudgetsTables } from '../types';
import { buildBudgetLedgerKey } from './build-budget-ledger-key';
import { pickLedgerPeriodKind } from './pick-ledger-period-kind';

export interface ChargedPayload {
  readonly chargeID: string;
  readonly budgetID: string;
  readonly periodStart: string;
  readonly ledgerKey?: string;
}

// The ledger key of a charge. A charge from before the ledger names none, so its key takes the kind
// that the migration kept for it, which a replay finds whatever the budget has become since. A
// charge that the migration never saw takes the period kind of the budget in force.
export async function readChargeLedgerKey(
  tx: Transaction<unknown>,
  payload: ChargedPayload,
): Promise<string> {
  if (payload.ledgerKey !== undefined) {
    return payload.ledgerKey;
  }

  const tables = tx.$extendTables<BudgetsTables>();

  const kept = await tables
    .selectFrom('legacy_charge_kinds')
    .select('period_kind')
    .where('charge_id', '=', payload.chargeID)
    .executeTakeFirst();

  if (kept !== undefined) {
    return buildBudgetLedgerKey(payload.budgetID, {
      kind: pickLedgerPeriodKind(kept.period_kind, payload.budgetID),
      start: payload.periodStart,
    });
  }

  const row = await tables
    .selectFrom('budgets_in_force')
    .select('period')
    .where('budget_id', '=', payload.budgetID)
    .executeTakeFirst();

  const kind = pickLedgerPeriodKind(row?.period, payload.budgetID);

  return buildBudgetLedgerKey(payload.budgetID, { kind, start: payload.periodStart });
}
