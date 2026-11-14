import type { Log, LogRecord } from '@heynixie/log';
import type { InboxMessage } from '@heynixie/wire';
import { pickTurnInbox } from './pick-turn-inbox';
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
  const picked = pickTurnInbox(inbox);

  const messages = await readInboxMessages(log, picked, read);

  return { records: picked.slice(0, messages.length), messages };
}
