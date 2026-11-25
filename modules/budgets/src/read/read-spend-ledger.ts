import type { Kysely } from 'kysely';
import type { BudgetsTables } from '../types';

export interface SpendLedgerEntry {
  readonly counter: string;
  readonly unit: string;
  readonly periodKind: string;
  readonly periodStart: string;
  readonly amount: number;
}

// Every row of the spend ledger, in key order: each budget's amount in each period, and what each
// task run and worker run spent.
export async function readSpendLedger(db: Kysely<unknown>): Promise<readonly SpendLedgerEntry[]> {
  const rows = await db
    .$extendTables<BudgetsTables>()
    .selectFrom('spend_ledger')
    .select(['counter', 'unit', 'period_kind', 'period_start', 'amount'])
    .orderBy('ledger_key')
    .execute();

  return rows.map((row) => ({
    counter: row.counter,
    unit: row.unit,
    periodKind: row.period_kind,
    periodStart: row.period_start,
    amount: row.amount,
  }));
}
