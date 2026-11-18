import { buildBuiltInBudgets, chargeBudgetsInTransaction } from '@heynixie/budgets';
import { systemClock } from '@heynixie/clock';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

export interface PaidBudgetSpend {
  // the paid tool whose built-in budget is charged
  readonly tool: string;

  // the budget that takes the charge, such as search-day
  readonly budgetID: string;
  readonly amountMicros: number;
}

// Writes one charge to a built-in paid-tool budget. No nixie may hold the data's writer lock.
export async function seedPaidBudgetSpend(
  nixie: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
  spend: PaidBudgetSpend,
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
      builtIn: () => buildBuiltInBudgets([spend.tool]),
    };

    const charged = await withWriteTransaction(data.writer, (tx) =>
      chargeBudgetsInTransaction(tx, budgets, {
        budgetIDs: [spend.budgetID],
        amountMicros: spend.amountMicros,
        for: { kind: 'action', id: 'seeded-spend' },
      }),
    );

    invariant('chargeIDs' in charged, 'the built-in budget has room for the seeded spend');
  } finally {
    await data.writer.stop();
  }
}
