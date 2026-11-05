import type { Log, LogRecord } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import type { InboxMessage } from '@heynixie/wire';
import { countImages } from './count-images';
import { isPastImageBudget } from './is-past-image-budget';
import { mergeImageTallies } from './merge-image-tallies';
import type { TaskMessageView } from './render-task-message';
import { toInboxMessage } from './to-inbox-message';
import type { ImageTally, MessageTimeOptions } from './types';

export interface InboxRead {
  readonly times: MessageTimeOptions;
  readonly view: TaskMessageView;

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
    const message = await readInboxMessage(log, record, read);

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
  read: Pick<InboxRead, 'times' | 'view'>,
): Promise<InboxMessage> {
  if (ownerMessageCodec.tryDecodePartial(record.payload)?.images === undefined) {
    return toInboxMessage(record, read.times, read.view);
  }

  const attachments = await readRecordAttachments(log, [record.sequence]);

  const attached = attachments.get(record.sequence);
  const bytes = attached?.status === 'readable' ? attached.attachments : [];

  return toInboxMessage(record, read.times, read.view, bytes);
}
