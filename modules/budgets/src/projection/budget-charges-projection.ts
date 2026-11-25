import type { Projection } from '@heynixie/log';
import { readChargeLedgerKey } from '../ledger/read-charge-ledger-key';
import { budgetChargedCodec } from '../record/budget-charged-codec';
import { budgetCreditedCodec } from '../record/budget-credited-codec';
import type { BudgetsTables } from '../types';

// One row per charge. A credit marks its charge, so the row keeps the amount that was given back.
export const budgetChargesProjection: Projection = {
  table: 'budget_charges',
  keyColumn: 'charge_id',
  fold: async (tx, record) => {
    if (record.thread !== null) {
      return [];
    }

    const tables = tx.$extendTables<BudgetsTables>();

    if (record.kind === budgetChargedCodec.kind) {
      const payload = budgetChargedCodec.decode(record.payload);

      const ledgerKey = await readChargeLedgerKey(tx, payload, record.sequence);

      await tables
        .insertInto('budget_charges')
        .values({
          charge_id: payload.chargeID,
          budget_id: payload.budgetID,
          period_start: payload.periodStart,
          amount_micros: payload.amountMicros,
          for_kind: payload.for.kind,
          for_id: payload.for.id,
          credited: 0,
          ledger_key: ledgerKey,
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute();

      return [payload.chargeID];
    }

    if (record.kind === budgetCreditedCodec.kind) {
      const payload = budgetCreditedCodec.decode(record.payload);

      await tables
        .updateTable('budget_charges')
        .set({ credited: 1 })
        .where('charge_id', '=', payload.chargeID)
        .execute();

      return [payload.chargeID];
    }

    return [];
  },
};
