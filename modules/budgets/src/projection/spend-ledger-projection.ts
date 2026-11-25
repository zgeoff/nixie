import type { Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { readChargeLedgerKey } from '../ledger/read-charge-ledger-key';
import { splitLedgerKey } from '../ledger/split-ledger-key';
import { budgetChargedCodec } from '../record/budget-charged-codec';
import { budgetCreditedCodec } from '../record/budget-credited-codec';
import type { BudgetsTables } from '../types';

// The amount of each counter in each period, in integer units. A credit subtracts from the row its
// charge added to, so it folds before the charges projection marks that charge credited.
export const spendLedgerProjection: Projection = {
  table: 'spend_ledger',
  keyColumn: 'ledger_key',
  fold: async (tx, record) => {
    if (record.thread !== null) {
      return [];
    }

    const tables = tx.$extendTables<BudgetsTables>();

    if (record.kind === budgetChargedCodec.kind) {
      const payload = budgetChargedCodec.decode(record.payload);

      const key = await readChargeLedgerKey(tx, payload, record.sequence);

      await addToLedger(tx, key, payload.amountMicros);

      return [key];
    }

    if (record.kind === budgetCreditedCodec.kind) {
      const payload = budgetCreditedCodec.decode(record.payload);

      const charge = await tables
        .selectFrom('budget_charges')
        .select(['ledger_key', 'amount_micros', 'credited'])
        .where('charge_id', '=', payload.chargeID)
        .executeTakeFirst();

      if (charge === undefined || charge.credited === 1) {
        return [];
      }

      await addToLedger(tx, charge.ledger_key, -charge.amount_micros);

      return [charge.ledger_key];
    }

    return [];
  },
};

async function addToLedger(
  tx: Transaction<unknown>,
  ledgerKey: string,
  delta: number,
): Promise<void> {
  const parts = splitLedgerKey(ledgerKey);

  await tx
    .$extendTables<BudgetsTables>()
    .insertInto('spend_ledger')
    .values({
      ledger_key: ledgerKey,
      counter: parts.counter,
      unit: parts.unit,
      period_kind: parts.kind,
      period_start: parts.start,
      amount: delta,
    })
    .onConflict((conflict) =>
      conflict.column('ledger_key').doUpdateSet((eb) => ({
        amount: eb('spend_ledger.amount', '+', delta),
      })),
    )
    .execute();
}
