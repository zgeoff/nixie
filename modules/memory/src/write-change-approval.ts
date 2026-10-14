import { withWriteTransaction } from '@heynixie/log';
import type { ChangeAnswer, ConsolidationTables } from './consolidation-types';
import { planChangeVersions } from './plan-change-versions';
import { requirePendingChange } from './require-pending-change';
import type { StoreParts, VersionRef } from './types';
import { updateVersionIndex } from './update-version-index';
import { writeConsolidatorWakeInTransaction } from './write-consolidator-wake-in-transaction';
import type { WrittenVersion } from './write-version-in-transaction';
import { writeVersionInTransaction } from './write-version-in-transaction';

// Applies one consolidation change with your approval, while it is pending under the hash you saw.
// Its versions commit in one transaction with the approval record, each bound to the version the
// change read, so one input that moved on fails the whole change as stale and applies nothing.
export async function writeChangeApproval(
  parts: StoreParts,
  answer: ChangeAnswer,
): Promise<readonly VersionRef[]> {
  const requirement = { changeID: answer.changeID, actionHash: answer.actionHash };
  const row = await requirePendingChange(
    parts.context.log.writer.db.$extendTables<ConsolidationTables>(),
    { ...requirement, now: parts.context.gate.clock.now() },
  );
  const plans = await planChangeVersions(parts, row, answer);

  return parts.lock(async () => {
    const written = await withWriteTransaction(parts.context.log.writer, async (tx) => {
      await requirePendingChange(tx.$extendTables<ConsolidationTables>(), {
        ...requirement,
        now: parts.context.gate.clock.now(),
      });

      const versions: WrittenVersion[] = [];

      for (const plan of plans) {
        // oxlint-disable-next-line no-await-in-loop -- each version reads the rows the one before wrote
        const version = await writeVersionInTransaction(parts, tx, plan);

        versions.push(version);
      }
      await writeConsolidatorWakeInTransaction(tx, parts);
      return versions;
    });

    for (const version of written) {
      // oxlint-disable-next-line no-await-in-loop -- the index takes one entry at a time
      await updateVersionIndex(parts, version.ref.itemID, version.next);
    }
    const refs = written.map((version) => version.ref);

    // the change's own item first, though it writes last
    return [...refs.slice(-1), ...refs.slice(0, -1)];
  });
}
