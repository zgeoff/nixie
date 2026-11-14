import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { MemoryTables, StoreParts } from '../types';
import type { ConsolidationTables } from '../utils/memory-consolidations';
import { memoryConsolidatorTaskID } from '../utils/memory-consolidator-task-id';

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
