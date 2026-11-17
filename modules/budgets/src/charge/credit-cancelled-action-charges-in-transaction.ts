import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { BudgetsContext, BudgetsTables } from '../types';
import { writeBudgetCredits } from './write-budget-credits';

type ActionsRows = Readonly<{
  actions: { readonly action_id: string; readonly cancelled_sequence: number | null };
}>;

// Credits the charges of the actions that one Stop cancelled, which the Stop's own transaction
// writes after its record, because the actions projection marks the cancelled actions on that record.
export async function creditCancelledActionChargesInTransaction(
  tx: Transaction<unknown>,
  context: BudgetsContext,
  stopSequence: number,
): Promise<number> {
  const open = await tx
    .$extendTables<BudgetsTables & ActionsRows>()
    .selectFrom('budget_charges')
    .select('charge_id')
    .where('for_kind', '=', 'action')
    .where('credited', '=', 0)
    .where(
      'for_id',
      'in',
      tx
        .$extendTables<ActionsRows>()
        .selectFrom('actions')
        .select('action_id')
        .where('cancelled_sequence', '=', stopSequence),
    )
    .orderBy(sql`rowid`)
    .execute();

  await writeBudgetCredits(
    tx,
    context,
    open.map((charge) => charge.charge_id),
  );

  return open.length;
}
