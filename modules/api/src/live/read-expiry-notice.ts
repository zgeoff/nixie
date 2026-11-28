import type { LogRecord as ContractRecord } from '@heynixie/contract';
import type { LogRecord, LogTables } from '@heynixie/log';
import { erasureStartedCodec } from '@heynixie/log';
import type { APIContext } from '../types';

const chunkSize = 500;

// The notice that an expiry's start gives a thread on screen: the records of the thread whose
// payload the expiry removes. An expiry that reaches nothing on the thread gives no notice.
export async function readExpiryNotice(
  context: Pick<APIContext, 'log'>,
  record: LogRecord,
  thread: string,
): Promise<ContractRecord | null> {
  if (record.kind !== erasureStartedCodec.kind) {
    return null;
  }

  const started = erasureStartedCodec.decode(record.payload);

  if (started.kind !== 'expiry' || !('ids' in started.capture.keys)) {
    return null;
  }

  const keyIDs = started.capture.keys.ids;
  const sequences: number[] = [];

  for (let start = 0; start < keyIDs.length; start += chunkSize) {
    const rows = await context.log.writer.db
      .$extendTables<LogTables>()
      .selectFrom('records')
      .select('sequence')
      .where('thread', '=', thread)
      .where('key_id', 'in', keyIDs.slice(start, start + chunkSize))
      .execute();

    sequences.push(...rows.map((row) => row.sequence));
  }

  return sequences.length === 0
    ? null
    : {
        expiry: { sequences },
        kind: record.kind,
        recordedAt: record.recordedAt,
        sequence: record.sequence,
        thread,
      };
}
