import type { Log, LogTables } from '@heynixie/log';
import { z } from 'zod';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { MemoryVersionRow } from './types';

const appliedVersion = z.object({ itemID: z.string(), version: z.int() });

const publishedBatch = z.object({
  applied: z.array(appliedVersion),
  model: z.string().nullable(),
});

// Loads the model that wrote a version. A version the memory writer applied before its versions
// kept the model holds none, so it takes the model of the batch that applied it: that batch's
// published record commits after its versions, in the same transaction and the writer's thread.
export async function loadWriterModel(
  log: Pick<Log, 'writer'>,
  row: MemoryVersionRow,
): Promise<string | null> {
  if (row.model !== null || row.origin !== 'memory_writer' || row.proposal_id !== null) {
    return row.model;
  }

  const published = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('payload')
    .where('thread', '=', memoryWriterTaskID)
    .where('kind', '=', 'memory.batch_published')
    .where('sequence', '>', row.sequence)
    .orderBy('sequence')
    .limit(1)
    .executeTakeFirst();

  if (published === undefined) {
    return null;
  }

  const batch = publishedBatch.parse(JSON.parse(published.payload));

  const isApplied = batch.applied.some(
    (ref) => ref.itemID === row.item_id && ref.version === row.version,
  );

  return isApplied ? batch.model : null;
}
