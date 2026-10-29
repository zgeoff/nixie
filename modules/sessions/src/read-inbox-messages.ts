import type { Log, LogRecord } from '@heynixie/log';
import { readRecordAttachments, readRecords } from '@heynixie/log';
import { ownerMessageCodec, taskMessageMovedCodec } from '@heynixie/tasks';
import type { InboxMessage } from '@heynixie/wire';
import { countImages } from './count-images';
import { encodeInboxUUID } from './encode-inbox-uuid';
import { isPastImageBudget } from './is-past-image-budget';
import { mergeImageTallies } from './merge-image-tallies';
import { renderMovedMessage } from './render-moved-message';
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
  if (record.kind === 'task.message_moved') {
    return readMovedMessage(log, record, read);
  }

  if (ownerMessageCodec.tryDecodePartial(record.payload)?.images === undefined) {
    return toInboxMessage(record, read.times, read.view);
  }

  const attachments = await readRecordAttachments(log, [record.sequence]);

  const attached = attachments.get(record.sequence);
  const bytes = attached?.status === 'readable' ? attached.attachments : [];

  return toInboxMessage(record, read.times, read.view, bytes);
}

async function readMovedMessage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  record: LogRecord,
  read: Pick<InboxRead, 'times' | 'view'>,
): Promise<InboxMessage> {
  const move = taskMessageMovedCodec.decode(record.payload);

  const [entry] =
    record.thread === move.to
      ? await readRecords(log, { afterSequence: 0, sequences: [move.message], limit: 1 })
      : [];

  const original = entry?.record.kind === 'owner_message' ? entry.record : null;

  const message = {
    uuid: encodeInboxUUID(record.sequence),
    text: renderMovedMessage(record, original, read.times, read.view),
  };

  if (original === null) {
    return message;
  }

  const delivered = await readInboxMessage(log, original, read);

  return delivered.images === undefined ? message : { ...message, images: delivered.images };
}
