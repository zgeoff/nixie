import type { LogRecord } from '@heynixie/log';
import type { InboxMessage } from '@heynixie/wire';
import type { InboxContext, InboxRead } from '../inbox/read-inbox-messages';
import { readInboxMessages } from '../inbox/read-inbox-messages';
import { pickTurnInbox } from './pick-turn-inbox';

export interface TurnBatch {
  readonly records: readonly LogRecord[];
  readonly messages: readonly InboxMessage[];
}

export async function readTurnBatch(
  context: InboxContext,
  inbox: readonly LogRecord[],
  read: InboxRead,
): Promise<TurnBatch> {
  const picked = pickTurnInbox(inbox);

  const messages = await readInboxMessages(context, picked, read);

  return { records: picked.slice(0, messages.length), messages };
}
