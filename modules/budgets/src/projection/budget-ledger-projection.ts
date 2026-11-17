import type { Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { budgetChargedCodec } from '../record/budget-charged-codec';
import { budgetCreditedCodec } from '../record/budget-credited-codec';
import type { BudgetsTables } from '../types';

// The charges of a budget in a period, less the credits. A credit reads its charge's row, so the
// charges projection folds after this one: it marks the charge credited only once this fold has
// seen the charge uncredited, and a second credit of the same charge changes nothing.
export const budgetLedgerProjection: Projection = {
  table: 'budget_ledger',
  keyColumn: 'budget_id',
  fold: async (tx, record) => {
    if (record.thread !== null) {
      return [];
    }

    const tables = tx.$extendTables<BudgetsTables>();

    if (record.kind === budgetChargedCodec.kind) {
      const payload = budgetChargedCodec.decode(record.payload);

      await addToLedger(tx, payload.budgetID, payload.periodStart, payload.amountMicros);

      return [payload.budgetID];
    }

    if (record.kind === budgetCreditedCodec.kind) {
      const payload = budgetCreditedCodec.decode(record.payload);

      const charge = await tables
        .selectFrom('budget_charges')
        .select(['budget_id', 'period_start', 'amount_micros', 'credited'])
        .where('charge_id', '=', payload.chargeID)
        .executeTakeFirst();

      if (charge === undefined || charge.credited === 1) {
        return [];
      }

      await addToLedger(tx, charge.budget_id, charge.period_start, -charge.amount_micros);

      return [charge.budget_id];
    }

    return [];
  },
};

async function addToLedger(
  tx: Transaction<unknown>,
  budgetID: string,
  periodStart: string,
  deltaMicros: number,
): Promise<void> {
  await tx
    .$extendTables<BudgetsTables>()
    .insertInto('budget_ledger')
    .values({ budget_id: budgetID, period_start: periodStart, spent_micros: deltaMicros })
    .onConflict((conflict) =>
      conflict.columns(['budget_id', 'period_start']).doUpdateSet((eb) => ({
        spent_micros: eb('budget_ledger.spent_micros', '+', deltaMicros),
      })),
    )
    .execute();
}
