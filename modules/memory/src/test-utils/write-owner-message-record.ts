import type { Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { MessageSpan } from '../gate-types';

export interface OwnerMessageRecord {
  readonly thread: string;
  readonly text: string;

  // how each span of the text arrived, covering it in order, as the client records them
  readonly spans: readonly MessageSpan[];
}

// Writes a message of yours as the API writes one: an owner_message record in the thread, with its
// text and spans in the erasable fields. It returns the record's sequence.
export async function writeOwnerMessageRecord(
  log: Log,
  message: OwnerMessageRecord,
): Promise<number> {
  const [record] = await writeRecords(log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: message.thread,
      contentSource: 'owner',
      payload: { spans: 'as_sent' },
      erasable: {
        text: message.text,
        spans: message.spans.map((span) => ({
          start: span.start,
          end: span.end,
          source: span.source,
        })),
      },
    },
  ]);

  invariant(record, 'the log wrote no owner_message record');
  return record.sequence;
}
