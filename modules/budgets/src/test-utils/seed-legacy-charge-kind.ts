import type { Writer } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { BudgetsTables } from '../types';

// Keeps the period kind that the migration gave a charge from before the ledger, or null for a
// charge whose kind the old rows could not show.
export async function seedLegacyChargeKind(
  writer: Writer,
  chargeID: string,
  periodKind: 'day' | 'week' | 'month' | null,
): Promise<void> {
  await withWriteTransaction(writer, async (tx) => {
    await tx
      .$extendTables<BudgetsTables>()
      .insertInto('legacy_charge_kinds')
      .values({ charge_id: chargeID, period_kind: periodKind })
      .execute();
  });
}
