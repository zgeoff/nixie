import type { Log, LogRecord } from '@heynixie/log';
import type { InboxMessage } from '@heynixie/wire';
import { inboxBatchLimit } from './inbox-batch-limit';
import type { InboxRead } from './read-inbox-messages';
import { readInboxMessages } from './read-inbox-messages';

export interface TurnBatch {
  readonly records: readonly LogRecord[];
  readonly messages: readonly InboxMessage[];
}

export async function readTurnBatch(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  inbox: readonly LogRecord[],
  read: InboxRead,
): Promise<TurnBatch> {
  const messages = await readInboxMessages(log, inbox.slice(0, inboxBatchLimit), read);

  return { records: inbox.slice(0, messages.length), messages };
}
