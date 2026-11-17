import type { Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';

export async function writeReplyRecord(log: Log, text: string): Promise<number> {
  const [record] = await writeRecords(log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text },
    },
  ]);

  invariant(record, 'the log wrote no model.reply record');

  return record.sequence;
}
