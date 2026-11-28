import type { ErasureCapture, LogTables, WriteTransaction } from '@heynixie/log';
import type { MomentTables } from '../utils/moment-context';

const chunkSize = 500;

// The keys of an expiry's capture whose record a kept moment now covers. A moment kept after the
// start still holds them, so they stay.
export async function readKeptKeyIDs(
  tx: WriteTransaction,
  capture: Pick<ErasureCapture, 'keys'>,
): Promise<readonly string[]> {
  if (!('ids' in capture.keys)) {
    return [];
  }

  const keyIDs = capture.keys.ids;
  const kept: string[] = [];

  for (let start = 0; start < keyIDs.length; start += chunkSize) {
    const rows = await tx
      .$extendTables<LogTables & MomentTables>()
      .selectFrom('records')
      .select('records.key_id')
      .where('records.key_id', 'in', keyIDs.slice(start, start + chunkSize))
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('moments')
            .select('moments.moment_id')
            .whereRef('moments.thread', '=', 'records.thread')
            .whereRef('moments.first_sequence', '<=', 'records.sequence')
            .whereRef('moments.last_sequence', '>=', 'records.sequence')
            .where('moments.state', 'in', ['active', 'retired']),
        ),
      )
      .execute();

    for (const row of rows) {
      if (row.key_id !== null) {
        kept.push(row.key_id);
      }
    }
  }

  return kept;
}
