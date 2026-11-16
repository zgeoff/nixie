import type { LogRecord } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { isInboxRecord, ownerMessageCodec } from '@heynixie/tasks';
import type { ToolImage } from '@heynixie/tools';
import type { InboxMessage } from '@heynixie/wire';
import type { TaskMessageView } from '../task/render-task-message';
import type { ImageTally, MessageTimeOptions } from '../types';
import { countImages } from '../utils/count-images';
import { isPastImageBudget } from '../utils/is-past-image-budget';
import { mergeImageTallies } from '../utils/merge-image-tallies';
import { isSilentFire } from './is-silent-fire';
import { readActionResult } from './read-action-result';
import { readReminder } from './read-reminder';
import { toInboxMessage } from './to-inbox-message';

// What reading a record needs: the log, and the reader of the version that a fire pins.
export type InboxContext = Pick<TasksContext, 'log' | 'readDefinitionVersion'>;

export interface InboxRead {
  readonly times: MessageTimeOptions;
  readonly view: TaskMessageView;

  readonly imageBudget: ImageTally;

  // The images that the call of an action returned, by the sequence of the action's outcome record.
  // No record keeps an image, so only the step that ran the call has them.
  readonly resultImages?: ReadonlyMap<number, readonly ToolImage[]>;
}

export interface InboxMessages {
  // the records that the read took, in order: each one that has a message, and each silent one
  readonly records: readonly LogRecord[];
  readonly messages: readonly InboxMessage[];

  // the records among them that render no message
  readonly silent: readonly LogRecord[];
}

export async function readInboxMessages(
  context: InboxContext,
  records: readonly LogRecord[],
  read: InboxRead,
): Promise<InboxMessages> {
  const taken: LogRecord[] = [];
  const messages: InboxMessage[] = [];
  const silent: LogRecord[] = [];
  let spent: ImageTally = { bytes: 0, count: 0 };

  for (const record of records) {
    // A kind that no module registers is passed over, as the live inbox does.
    if (!isInboxRecord(record)) {
      continue;
    }

    if (isSilentFire(record)) {
      taken.push(record);
      silent.push(record);
      continue;
    }

    const message = await readInboxMessage(context, record, read);

    const images = countImages(message);

    if (messages.length > 0 && isPastImageBudget(spent, images, read.imageBudget)) {
      return { records: taken, messages, silent };
    }

    spent = mergeImageTallies(spent, images);

    taken.push(record);
    messages.push(message);
  }

  return { records: taken, messages, silent };
}

async function readInboxMessage(
  context: InboxContext,
  record: LogRecord,
  read: Pick<InboxRead, 'times' | 'view' | 'resultImages'>,
): Promise<InboxMessage> {
  const reminder = await readReminder(context, record, read.times.defaultZone);
  const result = await readActionResult(context, record, read.resultImages?.get(record.sequence));

  if (ownerMessageCodec.tryDecodePartial(record.payload)?.images === undefined) {
    return toInboxMessage(record, read.times, read.view, { attachments: [], reminder, result });
  }

  const attachments = await readRecordAttachments(context.log, [record.sequence]);

  const attached = attachments.get(record.sequence);
  const bytes = attached?.status === 'readable' ? attached.attachments : [];

  return toInboxMessage(record, read.times, read.view, {
    attachments: bytes,
    reminder,
    result,
  });
}
