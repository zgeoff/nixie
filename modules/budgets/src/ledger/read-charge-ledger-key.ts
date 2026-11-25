import type { Transaction } from 'kysely';
import type { BudgetsTables } from '../types';
import { buildBudgetLedgerKey } from './build-budget-ledger-key';

export interface ChargedPayload {
  readonly budgetID: string;
  readonly periodStart: string;
  readonly ledgerKey?: string;
}

// The ledger key of a charge. A charge from before the ledger names none, so its key takes the
// period kind that the budget in force has when it changed no later than the charge, and the kind
// that the budget's ID ends with otherwise, as every built-in budget's ID does.
export async function readChargeLedgerKey(
  tx: Transaction<unknown>,
  payload: ChargedPayload,
  sequence: number,
): Promise<string> {
  if (payload.ledgerKey !== undefined) {
    return payload.ledgerKey;
  }

  const row = await tx
    .$extendTables<BudgetsTables>()
    .selectFrom('budgets_in_force')
    .select(['period', 'updated_sequence'])
    .where('budget_id', '=', payload.budgetID)
    .executeTakeFirst();

  const kind =
    row !== undefined && row.updated_sequence <= sequence
      ? row.period
      : pickKindFromID(payload.budgetID);

  return buildBudgetLedgerKey(payload.budgetID, { kind: toKind(kind), start: payload.periodStart });
}

function pickKindFromID(budgetID: string): string {
  if (budgetID.endsWith('-month')) {
    return 'month';
  }

  return budgetID.endsWith('-week') ? 'week' : 'day';
}

function toKind(kind: string): 'day' | 'week' | 'month' {
  return kind === 'week' || kind === 'month' ? kind : 'day';
}
