import type { LogRecord } from '@heynixie/log';
import type { InboxMessage } from '@heynixie/wire';
import type { InboxContext, InboxRead } from '../inbox/read-inbox-messages';
import { readInboxMessages } from '../inbox/read-inbox-messages';
import { pickTurnInbox } from './pick-turn-inbox';

export interface TurnBatch {
  // the records that the turn takes, in order, the silent ones included
  readonly records: readonly LogRecord[];
  readonly messages: readonly InboxMessage[];

  // the records among them that render no message, which the host marks read itself
  readonly silent: readonly LogRecord[];
}

export function readTurnBatch(
  context: InboxContext,
  inbox: readonly LogRecord[],
  read: InboxRead,
): Promise<TurnBatch> {
  const picked = pickTurnInbox(inbox);

  return readInboxMessages(context, picked, read);
}
