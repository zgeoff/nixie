import type { Kysely } from 'kysely';
import type { BudgetsTables } from '../types';

export interface UncountedCharge {
  readonly budgetID: string;
  readonly periodStart: string;
  readonly amountMicros: number;
}

// The uncredited total of each budget period whose charges count in no ledger row, because the old
// rows could not show the period they were charged under.
export async function readUncountedCharges(
  db: Kysely<unknown>,
): Promise<readonly UncountedCharge[]> {
  const rows = await db
    .$extendTables<BudgetsTables>()
    .selectFrom('budget_charges')
    .select((eb) => [
      'budget_id',
      'period_start',
      eb.fn.sum<number>('amount_micros').as('amount_micros'),
    ])
    .where('ledger_key', 'is', null)
    .where('credited', '=', 0)
    .groupBy(['budget_id', 'period_start'])
    .orderBy('budget_id')
    .orderBy('period_start')
    .execute();

  return rows.map((row) => ({
    budgetID: row.budget_id,
    periodStart: row.period_start,
    amountMicros: row.amount_micros,
  }));
}
