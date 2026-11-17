import { chargeBudgetsInTransaction, creditBudgetChargesInTransaction } from '@heynixie/budgets';
import { seedBudgetInForce } from '@heynixie/budgets/test-utils';
import { systemClock } from '@heynixie/clock';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

// Puts a budget in force and writes 2 charges and a credit, the `budget.*` records that a release
// before budgets never wrote. No nixie may hold the data's writer lock.
export async function seedBudgetRecords(
  nixie: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
): Promise<void> {
  const data = await startDataLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: systemClock,
  });

  try {
    const budgets = {
      log: data.context.log,
      clock: systemClock,
      zone: 'UTC',
      definitions: data.context.definitions,
      builtIn: () => [],
    };

    await seedBudgetInForce(data.writer, {
      id: 'groceries',
      counts: 'spend',
      limitMicros: 80_000_000,
      period: 'week',
    });

    const charged = await withWriteTransaction(data.writer, async (tx) => {
      const first = await chargeBudgetsInTransaction(tx, budgets, {
        budgetIDs: ['groceries'],
        amountMicros: 12_000_000,
        for: { kind: 'action', id: 'action-1' },
      });

      const second = await chargeBudgetsInTransaction(tx, budgets, {
        budgetIDs: ['groceries'],
        amountMicros: 7_000_000,
        for: { kind: 'action', id: 'action-2' },
      });

      return [first, second];
    });

    invariant(
      charged.every((result) => 'chargeIDs' in result),
      'the seeded budget has room for both charges',
    );

    await withWriteTransaction(data.writer, (tx) =>
      creditBudgetChargesInTransaction(tx, budgets, { for: { kind: 'action', id: 'action-2' } }),
    );
  } finally {
    await data.writer.stop();
  }
}
