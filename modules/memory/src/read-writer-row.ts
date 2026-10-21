import type { Log } from '@heynixie/log';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { WriterRow, WriterTables } from './writer-types';

export function readWriterRow(log: Pick<Log, 'writer'>): Promise<WriterRow> {
  return log.writer.db
    .$extendTables<WriterTables>()
    .selectFrom('memory_writer')
    .selectAll()
    .where('writer_id', '=', memoryWriterTaskID)
    .executeTakeFirstOrThrow();
}
