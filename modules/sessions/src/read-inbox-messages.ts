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

  // the most images, in base64 bytes and in count, that the messages may carry together; the first
  // message always goes, so one message of yours with the most images a send takes still reaches
  // the model
  readonly imageBudget: ImageTally;
}

// Reads the inbox records a turn takes as the guest passes them to the model, oldest first, each
// with its images. It stops before the record whose images would pass the budget, and the rest wait
// for the next turn; a message with no images passes a budget already spent.
export async function readInboxMessages(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  records: readonly LogRecord[],
  read: InboxRead,
): Promise<readonly InboxMessage[]> {
  const messages: InboxMessage[] = [];
  let spent: ImageTally = { bytes: 0, count: 0 };

  for (const record of records) {
    // oxlint-disable-next-line no-await-in-loop -- each record's images read only once the budget has room
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
