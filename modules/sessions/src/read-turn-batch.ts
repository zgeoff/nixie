import type { Log, LogRecord } from '@heynixie/log';
import type { InboxMessage } from '@heynixie/wire';
import { inboxBatchLimit } from './inbox-batch-limit';
import type { InboxRead } from './read-inbox-messages';
import { readInboxMessages } from './read-inbox-messages';

export interface TurnBatch {
  // the inbox records the turn takes, which the messages stand for in order
  readonly records: readonly LogRecord[];
  readonly messages: readonly InboxMessage[];
}

// Reads the inbox records a turn opens with: the oldest, up to the batch limit, and only as many as
// the image budget the session has left lets through, so a record past either waits for the next
// turn.
export async function readTurnBatch(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  inbox: readonly LogRecord[],
  read: InboxRead,
): Promise<TurnBatch> {
  const messages = await readInboxMessages(log, inbox.slice(0, inboxBatchLimit), read);

  return { records: inbox.slice(0, messages.length), messages };
}
