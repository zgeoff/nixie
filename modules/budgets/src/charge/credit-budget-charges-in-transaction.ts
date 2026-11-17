import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { BudgetsContext, BudgetsTables, ChargeFor } from '../types';
import { writeBudgetCredits } from './write-budget-credits';

export interface CreditTarget {
  readonly for: ChargeFor;
}

// Credits every charge of the call or the action that no credit has given back yet. A second call
// credits nothing, so a retry of the transaction never gives the money back twice.
export async function creditBudgetChargesInTransaction(
  tx: Transaction<unknown>,
  context: BudgetsContext,
  target: CreditTarget,
): Promise<number> {
  const open = await tx
    .$extendTables<BudgetsTables>()
    .selectFrom('budget_charges')
    .select('charge_id')
    .where('for_kind', '=', target.for.kind)
    .where('for_id', '=', target.for.id)
    .where('credited', '=', 0)
    .orderBy(sql`rowid`)
    .execute();

  await writeBudgetCredits(
    tx,
    context,
    open.map((charge) => charge.charge_id),
  );

  return open.length;
}
