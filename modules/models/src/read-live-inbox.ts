import type { LogRecord } from '@heynixie/log';
import { subscribeToRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { isInboxRecord } from '@heynixie/tasks';
import type { InboxMessage } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { countImageBytes } from './count-image-bytes';
import { readInboxMessages } from './read-inbox-messages';
import type { MessageTimeOptions } from './types';

// The session's image bytes in base64, which each live message adds to, its budget, and whether a
// message waits on that budget.
export interface LiveImages {
  spent: number;
  readonly budget: number;
  isCapped: boolean;
}

export interface LiveInbox {
  readonly taskID: string;

  // the sequence of each inbox record the turn already took, to which each live one is added
  readonly sent: Set<number>;
  readonly signal: AbortSignal;

  // how each message renders its send time
  readonly times: MessageTimeOptions;
  readonly images: LiveImages;
}

// Yields every inbox record that lands on the task while its turn runs, until the signal aborts,
// so the turn takes each at its next tool boundary. A message whose images would pass the session's
// image budget ends the feed, so it and every record after it wait for the next step.
export async function* readLiveInbox(
  context: Pick<TasksContext, 'log'>,

  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the turn's own set, which this fills in
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

      live.images.spent += countImageBytes(message);
      yield message;
    }
  }
}

interface LiveRead {
  readonly times: MessageTimeOptions;
  readonly images: Readonly<LiveImages>;
}

// the record's message, or null when its images would pass the session's image budget; a
// one-record read returns its record whatever the budget, so the feed checks the budget itself
async function readLiveMessage(
  context: Pick<TasksContext, 'log'>,
  live: LiveRead,
  record: LogRecord,
): Promise<InboxMessage | null> {
  const [message] = await readInboxMessages(context.log, [record], {
    times: live.times,
    imageBudgetBytes: 0,
  });

  invariant(message, 'the inbox read returned no message for its one record');

  const bytes = countImageBytes(message);

  return bytes > 0 && live.images.spent + bytes > live.images.budget ? null : message;
}
