import { subscribeToRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { isInboxRecord } from '@heynixie/tasks';
import type { InboxMessage } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { readInboxMessages } from './read-inbox-messages';
import type { MessageTimeOptions } from './types';

export interface LiveInbox {
  readonly taskID: string;

  // the sequence of each inbox record the turn already took, to which each live one is added
  readonly sent: Set<number>;
  readonly signal: AbortSignal;

  // how each message renders its send time
  readonly times: MessageTimeOptions;
}

// Yields every inbox record that lands on the task while its turn runs, until the signal aborts,
// so the turn takes each at its next tool boundary.
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
      live.sent.add(entry.record.sequence);

      // a live message goes alone in its own frame, so its images need no budget past their own
      const [message] = await readInboxMessages(context.log, [entry.record], {
        times: live.times,
        imageBudgetBytes: 0,
      });

      // the first record always goes, whatever its images
      invariant(message, 'the inbox read returned no message for its one record');
      yield message;
    }
  }
}
