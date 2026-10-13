import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ConsolidationTables } from './consolidation-types';
import { memoryConsolidatorTaskID } from './memory-consolidator-task-id';
import type { StoreParts } from './types';

// Lapses every pending consolidation change past its lapse time in one transaction, and returns
// how many. A change seals its text under an item's own key, so a lapse leaves no key behind.
export function runChangeLapses(parts: StoreParts): Promise<number> {
  return withWriteTransaction(parts.context.log.writer, async (tx) => {
    const rows = await tx
      .$extendTables<ConsolidationTables>()
      .selectFrom('memory_consolidation_changes')
      .select('change_id')
      .where('status', '=', 'pending')
      .where('lapse_at', '<=', parts.context.gate.clock.now())
      .execute();

    await writeRecordsInTransaction(
      tx,
      parts.context.log,
      rows.map((row) => ({
        kind: 'memory.consolidation_lapsed',
        definitions: parts.context.definitions(),
        thread: memoryConsolidatorTaskID,
        payload: { changeID: row.change_id },
      })),
    );
    return rows.length;
  });
}
