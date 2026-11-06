import invariant from 'tiny-invariant';
import { removeRecordKey } from '../remove-record-key';
import type { Log, LogTables } from '../types';

export async function removeTestRecordKey(
  log: Pick<Log, 'writer'>,
  sequence: number,
): Promise<void> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', sequence)
    .executeTakeFirst();

  invariant(typeof row?.key_id === 'string', `the record ${String(sequence)} has no key`);

  await removeRecordKey(log, row.key_id);
}
