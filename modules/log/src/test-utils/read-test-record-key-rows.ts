import type { Selectable } from 'kysely';
import type { KeyStoreTables, Log } from '../types';

export function readTestRecordKeyRows(
  log: Pick<Log, 'writer'>,
): Promise<readonly Selectable<KeyStoreTables['record_keys']>[]> {
  return log.writer.keys
    .$extendTables<KeyStoreTables>()
    .selectFrom('record_keys')
    .selectAll()
    .orderBy('key_id')
    .execute();
}
