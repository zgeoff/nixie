import { subscribeToRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { isInboxRecord } from '@heynixie/tasks';
import type { InboxMessage } from '@heynixie/wire';
import { toInboxMessage } from './to-inbox-message';

export interface LiveInbox {
  readonly taskID: string;

  // the sequence of each inbox record the turn already took, to which each live one is added
  readonly sent: Set<number>;
  readonly signal: AbortSignal;
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
      yield toInboxMessage(entry.record);
    }
  }
}
