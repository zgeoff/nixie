import type { Log, LogRecord } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import type { InboxMessage } from '@heynixie/wire';
import { countImages } from './count-images';
import { isPastImageBudget } from './is-past-image-budget';
import { mergeImageTallies } from './merge-image-tallies';
import { toInboxMessage } from './to-inbox-message';
import type { ImageTally, MessageTimeOptions } from './types';

export interface InboxRead {
  readonly times: MessageTimeOptions;

  readonly imageBudget: ImageTally;
}

export async function readInboxMessages(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  records: readonly LogRecord[],
  read: InboxRead,
): Promise<readonly InboxMessage[]> {
  const messages: InboxMessage[] = [];
  let spent: ImageTally = { bytes: 0, count: 0 };

  for (const record of records) {
    const message = await readInboxMessage(log, record, read.times);

    const images = countImages(message);

    if (messages.length > 0 && isPastImageBudget(spent, images, read.imageBudget)) {
      return messages;
    }

    spent = mergeImageTallies(spent, images);

    messages.push(message);
  }

  return messages;
}

async function readInboxMessage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  record: LogRecord,
  times: MessageTimeOptions,
): Promise<InboxMessage> {
  if (ownerMessageCodec.tryDecodePartial(record.payload)?.images === undefined) {
    return toInboxMessage(record, times);
  }

  const attachments = await readRecordAttachments(log, [record.sequence]);

  const read = attachments.get(record.sequence);
  const bytes = read?.status === 'readable' ? read.attachments : [];

  return toInboxMessage(record, times, bytes);
}
