import type { Selectable } from 'kysely';
import type { Log, LogTables } from '../types';

export function readTestRecordAttachmentRows(
  log: Pick<Log, 'writer'>,
): Promise<readonly Selectable<LogTables['record_attachments']>[]> {
  return log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('record_attachments')
    .selectAll()
    .orderBy('sequence')
    .orderBy('position')
    .execute();
}
