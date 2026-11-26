import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { buildBudgetLedgerKey } from '../ledger/build-budget-ledger-key';
import { pickBudgetLimit } from '../limit/pick-budget-limit';
import { readBudgetsInForce } from '../limit/read-budgets-in-force';
import { buildBudgetBounds } from '../period/build-budget-bounds';
import type { BudgetsContext, BudgetsTables } from '../types';

export interface LedgerCharge {
  readonly chargeID: string;
  readonly amountMicros: number;
  readonly for: { readonly kind: string; readonly id: string };
  readonly isCredited: boolean;
}

export interface BudgetLedger {
  readonly budgetID: string;
  readonly periodStart: string;
  readonly resetsAt: number;
  readonly spentMicros: number;
  readonly charges: readonly LedgerCharge[];
}

// The charges of a budget in its period in force, oldest first, or null for a budget that no one
// defines.
export async function readBudgetLedger(
  db: Kysely<unknown>,
  context: BudgetsContext,
  budgetID: string,
): Promise<BudgetLedger | null> {
  const inForce = await readBudgetsInForce(db);

  const limit = pickBudgetLimit(budgetID, inForce, context.builtIn());

  if (limit === null) {
    return null;
  }

  const bounds = buildBudgetBounds(context.clock.now(), context.zone, limit.period);
  const tables = db.$extendTables<BudgetsTables>();
  const ledgerKey = buildBudgetLedgerKey(budgetID, bounds.period);

  const rows = await tables
    .selectFrom('budget_charges')
    .select(['charge_id', 'amount_micros', 'for_kind', 'for_id', 'credited'])
    .where('ledger_key', '=', ledgerKey)
    .orderBy(sql`rowid`)
    .execute();

  const ledger = await tables
    .selectFrom('spend_ledger')
    .select('amount')
    .where('ledger_key', '=', ledgerKey)
    .executeTakeFirst();

  return {
    budgetID,
    periodStart: bounds.period.start,
    resetsAt: bounds.resetsAtMs,
    spentMicros: ledger?.amount ?? 0,
    charges: rows.map((row) => ({
      chargeID: row.charge_id,
      amountMicros: row.amount_micros,
      for: { kind: row.for_kind, id: row.for_id },
      isCredited: row.credited === 1,
    })),
  };
}
