import type { LogRecord } from '@heynixie/log';
import { subscribeToRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { isInboxRecord } from '@heynixie/tasks';
import type { InboxMessage } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { countImages } from './count-images';
import { isPastImageBudget } from './is-past-image-budget';
import { mergeImageTallies } from './merge-image-tallies';
import { readInboxMessages } from './read-inbox-messages';
import type { ImageTally, MessageTimeOptions } from './types';

export interface LiveImages {
  spent: ImageTally;
  readonly budget: ImageTally;
  isCapped: boolean;
}

export interface LiveInbox {
  readonly taskID: string;

  readonly sent: Set<number>;
  readonly signal: AbortSignal;

  readonly times: MessageTimeOptions;
  readonly images: LiveImages;
}

export async function* readLiveInbox(
  context: Pick<TasksContext, 'log'>,

  live: LiveInbox,
): AsyncGenerator<InboxMessage> {
  const entries = subscribeToRecords(context.log, {
    afterSequence: Math.max(0, ...live.sent),
    thread: live.taskID,
    signal: live.signal,
  });

  for await (const entry of entries) {
    if (isInboxRecord(entry.record) && !live.sent.has(entry.record.sequence)) {
      const message = await readLiveMessage(context, live, entry.record);

      if (message === null) {
        live.images.isCapped = true;

        return;
      }

      live.sent.add(entry.record.sequence);

      live.images.spent = mergeImageTallies(live.images.spent, countImages(message));
      yield message;
    }
  }
}

interface LiveRead {
  readonly times: MessageTimeOptions;
  readonly images: Readonly<LiveImages>;
}

async function readLiveMessage(
  context: Pick<TasksContext, 'log'>,
  live: LiveRead,
  record: LogRecord,
): Promise<InboxMessage | null> {
  const [message] = await readInboxMessages(context.log, [record], {
    times: live.times,
    imageBudget: { bytes: 0, count: 0 },
  });

  invariant(message, 'the inbox read returned no message for its one record');

  return isPastImageBudget(live.images.spent, countImages(message), live.images.budget)
    ? null
    : message;
}
