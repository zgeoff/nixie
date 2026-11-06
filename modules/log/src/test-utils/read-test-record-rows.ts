import type { LogTables, RecordRow, Writer } from '../types';

export function readTestRecordRows(writer: Pick<Writer, 'db'>): Promise<readonly RecordRow[]> {
  return writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .selectAll()
    .orderBy('sequence')
    .execute();
}
