import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ChangeAnswer, ConsolidationTables } from './consolidation-types';
import { memoryConsolidatorTaskID } from './memory-consolidator-task-id';
import { requirePendingChange } from './require-pending-change';
import type { StoreParts } from './types';

// Closes one consolidation change with your rejection, while it is pending under the hash you saw.
// Nothing in memory changes, and the other changes of its diff still wait.
export async function writeChangeRejection(parts: StoreParts, answer: ChangeAnswer): Promise<void> {
  await withWriteTransaction(parts.context.log.writer, async (tx) => {
    await requirePendingChange(tx.$extendTables<ConsolidationTables>(), {
      changeID: answer.changeID,
      actionHash: answer.actionHash,
      now: parts.context.gate.clock.now(),
    });
    await writeRecordsInTransaction(tx, parts.context.log, [
      {
        kind: 'memory.consolidation_rejected',
        definitions: parts.context.definitions(),
        thread: memoryConsolidatorTaskID,
        payload: { changeID: answer.changeID, identityID: answer.identityID },
      },
    ]);
  });
}
