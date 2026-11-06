import type { Log, LogTables, RecordRow } from '../types';

export function readTestRecordRows(log: Pick<Log, 'writer'>): Promise<readonly RecordRow[]> {
  return log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .selectAll()
    .orderBy('sequence')
    .execute();
}
