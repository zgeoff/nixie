import { readLiveConnectionIDs } from '@heynixie/connections';
import type { DefinitionsExportSweep } from '@heynixie/definitions';
import { seedInForceInTransaction } from '@heynixie/definitions';
import { queueCommitHook } from '@heynixie/log';
import type { PlaceContext } from '@heynixie/policy';
import { readArmedReminders } from '@heynixie/reminders';
import { recordSeedResult } from '../seed/record-seed-result';
import type { SeedParts } from '../seed/run-queued-seed';

// The in-force seed that a write of the directory runs in its own transaction. A refusal throws, so
// the write rolls back with it, and the server takes the result in once the transaction commits.
export function makePlaceSeed(
  parts: SeedParts,
  exports: DefinitionsExportSweep | null,
): PlaceContext['runInForce'] {
  return async (tx) => {
    const result = await seedInForceInTransaction(tx, {
      log: parts.context.log,
      buildPolicy: parts.buildPolicy,
      builtInBudgets: parts.context.budgets?.builtIn() ?? [],
      readExtraArmed: readArmedReminders,
      readSelfPlaces: readLiveConnectionIDs,
    });

    if (result.status === 'refused') {
      throw result.error;
    }

    queueCommitHook(tx, () => {
      recordSeedResult(parts, result);
      exports?.wake();
    });
  };
}
