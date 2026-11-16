import type { Projection } from '@heynixie/log';
import type { MemoryTables } from '../types';
import { parseLabelRecord } from '../utils/record/parse-label-record';

export const memoryLabelsProjection: Projection = {
  table: 'memory_labels',
  keyColumn: 'sequence',
  fold: async (tx, record) => {
    const parsed = parseLabelRecord(record);

    if (parsed?.kind !== 'memory.labelled') {
      return [];
    }

    await tx
      .$extendTables<MemoryTables>()
      .insertInto('memory_labels')
      .values({
        item_id: parsed.itemID,
        revision: parsed.revision,
        version: parsed.version,
        change: parsed.change,
        sealed: parsed.sealed,
        origin: parsed.origin,
        source: parsed.source,
        task_id: parsed.taskID,
        proposal_id: parsed.proposalID,
        model: parsed.model,
        sequence: record.sequence,
        recorded_at: record.recordedAt.getTime(),
      })
      .execute();

    return [String(record.sequence)];
  },
};
