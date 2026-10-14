import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ConsolidationTables } from './consolidation-types';
import { memoryConsolidatorTaskID } from './memory-consolidator-task-id';
import type { MemoryTables, StoreParts } from './types';

// Lapses in one transaction every pending consolidation change past its lapse time, and every one
// whose first input is forgotten, since its text went with that item's key and nothing can apply
// it; returns how many. A lapse leaves no key behind, and frees the consolidator's next run.
export function runChangeLapses(parts: StoreParts): Promise<number> {
  return withWriteTransaction(parts.context.log.writer, async (tx) => {
    const rows = await tx
      .$extendTables<ConsolidationTables & MemoryTables>()
      .selectFrom('memory_consolidation_changes as change')
      .leftJoin('memory_items as item', 'item.item_id', 'change.item_id')
      .select('change.change_id')
      .where('change.status', '=', 'pending')
      .where((eb) =>
        eb.or([
          eb('change.lapse_at', '<=', parts.context.gate.clock.now()),
          eb('item.state', 'in', ['forgetting', 'forgotten']),
        ]),
      )
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
