import type { LogRecord } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { isInboxRecord, ownerMessageCodec } from '@heynixie/tasks';
import type { InboxMessage } from '@heynixie/wire';
import type { TaskMessageView } from '../task/render-task-message';
import type { ImageTally, MessageTimeOptions } from '../types';
import { countImages } from '../utils/count-images';
import { isPastImageBudget } from '../utils/is-past-image-budget';
import { mergeImageTallies } from '../utils/merge-image-tallies';
import { readReminder } from './read-reminder';
import { toInboxMessage } from './to-inbox-message';

// What reading a record needs: the log, and the reader of the version that a fire pins.
export type InboxContext = Pick<TasksContext, 'log' | 'readDefinitionVersion'>;

export interface InboxRead {
  readonly times: MessageTimeOptions;
  readonly view: TaskMessageView;

  readonly imageBudget: ImageTally;
}

export async function readInboxMessages(
  context: InboxContext,
  records: readonly LogRecord[],
  read: InboxRead,
): Promise<readonly InboxMessage[]> {
  const messages: InboxMessage[] = [];
  let spent: ImageTally = { bytes: 0, count: 0 };

  for (const record of records) {
    // A kind that no module registers is passed over, as the live inbox does.
    if (!isInboxRecord(record)) {
      continue;
    }

    const message = await readInboxMessage(context, record, read);

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
  context: InboxContext,
  record: LogRecord,
  read: Pick<InboxRead, 'times' | 'view'>,
): Promise<InboxMessage> {
  const reminder = await readReminder(context, record, read.times.defaultZone);

  if (ownerMessageCodec.tryDecodePartial(record.payload)?.images === undefined) {
    return toInboxMessage(record, read.times, read.view, { attachments: [], reminder });
  }

  const attachments = await readRecordAttachments(context.log, [record.sequence]);

  const attached = attachments.get(record.sequence);
  const bytes = attached?.status === 'readable' ? attached.attachments : [];

  return toInboxMessage(record, read.times, read.view, { attachments: bytes, reminder });
}
