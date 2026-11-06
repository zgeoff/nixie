import type { Selectable } from 'kysely';
import type { LogTables, Writer } from '../types';

export function readTestRecordAttachmentRows(
  writer: Pick<Writer, 'db'>,
): Promise<readonly Selectable<LogTables['record_attachments']>[]> {
  return writer.db
    .$extendTables<LogTables>()
    .selectFrom('record_attachments')
    .selectAll()
    .orderBy('sequence')
    .orderBy('position')
    .execute();
}
