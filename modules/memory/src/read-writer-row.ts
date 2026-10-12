import type { Log } from '@heynixie/log';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { WriterRow, WriterTables } from './writer-types';

// Reads the memory writer's row, which the writer's start creates before any runner claims work.
export function readWriterRow(log: Pick<Log, 'writer'>): Promise<WriterRow> {
  return log.writer.db
    .$extendTables<WriterTables>()
    .selectFrom('memory_writer')
    .selectAll()
    .where('writer_id', '=', memoryWriterTaskID)
    .executeTakeFirstOrThrow();
}
