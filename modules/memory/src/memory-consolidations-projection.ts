import type { Projection } from '@heynixie/log';
import type { ConsolidationTables } from './consolidation-types';
import { parseConsolidationRecord } from './parse-consolidation-record';

// One row per consolidator run, a run that proposed no change included, so the schedule reads when
// the last run was.
export const memoryConsolidationsProjection: Projection = {
  table: 'memory_consolidations',
  keyColumn: 'diff_id',
  fold: async (tx, record) => {
    const parsed = parseConsolidationRecord(record);

    if (parsed?.kind !== 'memory.consolidation_proposed') {
      return [];
    }
    await tx
      .$extendTables<ConsolidationTables>()
      .insertInto('memory_consolidations')
      .values({
        diff_id: parsed.diffID,
        model: parsed.model,
        changes: parsed.changes.length,
        shown_items: parsed.shownItems,
        sequence: record.sequence,
        created_at: parsed.at,
      })
      .execute();
    return [parsed.diffID];
  },
};
