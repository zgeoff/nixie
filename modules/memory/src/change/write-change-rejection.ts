import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { writeConsolidatorWakeInTransaction } from '../consolidator/write-consolidator-wake-in-transaction';
import { requirePendingChange } from '../pending/require-pending-change';
import type { StoreParts } from '../types';
import type { ChangeAnswer, ConsolidationTables } from '../utils/memory-consolidations';
import { memoryConsolidatorTaskID } from '../utils/memory-consolidator-task-id';

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

    await writeConsolidatorWakeInTransaction(tx, parts);
  });
}
