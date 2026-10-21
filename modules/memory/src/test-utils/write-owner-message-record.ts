import type { Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { MessageSpan } from '../gate-types';

export interface OwnerMessageRecord {
  readonly thread: string;
  readonly text: string;

  readonly spans: readonly MessageSpan[];

  readonly images?: readonly string[];
}

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
      payload: {
        spans: 'as_sent',
        ...(message.images === undefined || message.images.length === 0
          ? {}
          : { images: message.images.map((mediaType) => ({ mediaType })) }),
      },
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
