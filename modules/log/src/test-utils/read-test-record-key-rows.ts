import type { Selectable } from 'kysely';
import type { KeyStoreTables, Writer } from '../types';

export function readTestRecordKeyRows(
  writer: Pick<Writer, 'keys'>,
): Promise<readonly Selectable<KeyStoreTables['record_keys']>[]> {
  return writer.keys
    .$extendTables<KeyStoreTables>()
    .selectFrom('record_keys')
    .selectAll()
    .orderBy('key_id')
    .execute();
}
