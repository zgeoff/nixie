import { withWriteTransaction } from '@heynixie/log';
import { writeConversationRetryInTransaction } from '@heynixie/tasks';
import { z } from 'zod';
import { buildInputHash } from './build-input-hash';
import { probeLiveIdentity } from './probe-live-identity';
import type { ClientAction } from './read-client-action';
import { readClientAction } from './read-client-action';
import type { APIContext, Identity } from './types';
import { writeClientAction } from './write-client-action';

interface ConversationRetryInput {
  readonly clientActionID: string;
}

type ConversationRetryResult =
  | { readonly status: 'retried'; readonly retriedAt: number }
  | { readonly status: 'nothing_to_retry' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

const procedure = 'conversation.retry';

export function writeConversationRetry(
  context: APIContext,
  caller: Identity,
  input: ConversationRetryInput,
): Promise<ConversationRetryResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const [live, earlier] = await Promise.all([
      probeLiveIdentity(tx, context, caller.identityID),
      readClientAction(tx, input.clientActionID),
    ]);

    const inputHash = buildInputHash({});
    const settled = pickSettledRetry({ live, earlier, inputHash, callerID: caller.identityID });

    if (settled !== null) {
      return settled;
    }

    const outcome = await writeConversationRetryInTransaction(tx, context);

    if (outcome.status === 'refused') {
      return { status: 'nothing_to_retry' };
    }

    const retriedAt = context.clock.now();

    await writeClientAction(tx, {
      clientActionID: input.clientActionID,
      procedure,
      identityID: caller.identityID,
      inputHash,
      result: { retriedAt },
      recordedAt: retriedAt,
    });

    return { status: 'retried', retriedAt };
  });
}

interface RetryState {
  readonly live: boolean;
  readonly earlier: ClientAction | null;
  readonly inputHash: string;
  readonly callerID: string;
}

const retriedResultSchema = z.object({ retriedAt: z.number() });

function pickSettledRetry(state: RetryState): ConversationRetryResult | null {
  if (!state.live) {
    return { status: 'unauthorized' };
  }

  if (state.earlier === null) {
    return null;
  }

  const isSameAction =
    state.earlier.procedure === procedure &&
    state.earlier.identityID === state.callerID &&
    state.earlier.inputHash === state.inputHash;

  return isSameAction
    ? { status: 'retried', ...retriedResultSchema.parse(state.earlier.result) }
    : { status: 'reused' };
}
