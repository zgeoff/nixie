import type { Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';

export async function writeOwnerMessages(
  log: Log,
  texts: readonly string[],
): Promise<readonly number[]> {
  const records = await writeRecords(
    log,
    texts.map((text) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text, spans: [{ start: 0, end: text.length, source: 'typed' }] },
    })),
  );

  return records.map((record) => record.sequence);
}
