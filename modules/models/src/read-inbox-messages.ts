import type { Log, LogRecord } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import type { InboxMessage } from '@heynixie/wire';
import { countImageBytes } from './count-image-bytes';
import { toInboxMessage } from './to-inbox-message';
import type { MessageTimeOptions } from './types';

export interface InboxRead {
  readonly times: MessageTimeOptions;

  // the most image bytes, in base64, that the messages may carry together; the first message
  // always goes, so one message of yours with the most images a send takes still reaches the model
  readonly imageBudgetBytes: number;
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
  const spent = { bytes: 0 };

  for (const record of records) {
    // oxlint-disable-next-line no-await-in-loop -- each record's images read only once the budget has room
    const message = await readInboxMessage(log, record, read.times);

    const bytes = countImageBytes(message);

    if (messages.length > 0 && bytes > 0 && spent.bytes + bytes > read.imageBudgetBytes) {
      return messages;
    }

    spent.bytes += bytes;

    messages.push(message);
  }

  return messages;
}

async function readInboxMessage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  record: LogRecord,
  times: MessageTimeOptions,
): Promise<InboxMessage> {
  if (!Array.isArray(record.payload['images'])) {
    return toInboxMessage(record, times);
  }

  const attachments = await readRecordAttachments(log, [record.sequence]);

  const read = attachments.get(record.sequence);
  const bytes = read?.status === 'readable' ? read.attachments : [];

  return toInboxMessage(record, times, bytes);
}
