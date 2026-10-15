import type { Log, LogRecord } from '@heynixie/log';
import type { InboxMessage } from '@heynixie/wire';
import { inboxBatchLimit } from './inbox-batch-limit';
import { readInboxMessages } from './read-inbox-messages';
import { turnImageBudgetBytes } from './turn-image-budget-bytes';
import type { MessageTimeOptions } from './types';

export interface TurnBatch {
  // the inbox records the turn takes, which the messages stand for in order
  readonly records: readonly LogRecord[];
  readonly messages: readonly InboxMessage[];
}

// Reads the inbox records a turn opens with: the oldest, up to the batch limit, and only as many as
// the turn's image budget lets through, so a record past either waits for the next turn.
export async function readTurnBatch(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  inbox: readonly LogRecord[],
  times: MessageTimeOptions,
): Promise<TurnBatch> {
  const messages = await readInboxMessages(log, inbox.slice(0, inboxBatchLimit), {
    times,
    imageBudgetBytes: turnImageBudgetBytes,
  });

  return { records: inbox.slice(0, messages.length), messages };
}
