import { withWriteTransaction } from '@heynixie/log';
import { buildInputHash } from './build-input-hash';
import { probeLiveIdentity } from './probe-live-identity';
import type { ClientAction } from './read-client-action';
import { readClientAction } from './read-client-action';
import { runRecordForgetCleanup } from './run-record-forget-cleanup';
import type { APIContext, Identity } from './types';
import { writeClientAction } from './write-client-action';
import { writeForgetStart } from './write-forget-start';

interface RecordForgetInput {
  readonly clientActionID: string;
  readonly thread: string;
  readonly sequence: number;
}

type RecordForgetResult =
  | { readonly status: 'forgotten'; readonly forgottenAt: number }
  | { readonly status: 'not_found' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

// Forgets your message or a reply, a checked action bound to the record's thread and sequence. It
// commits record.forget_started with the action's result, then runs the cleanup. A record already
// forgetting gets no second start, and a retry runs the cleanup again, so a failed one finishes.
export async function writeRecordForget(
  context: APIContext,
  caller: Identity,
  input: RecordForgetInput,
): Promise<RecordForgetResult> {
  const result = await withWriteTransaction(context.log.writer, async (tx) => {
    const [live, earlier] = await Promise.all([
      probeLiveIdentity(tx, context, caller.identityID),
      readClientAction(tx, input.clientActionID),
    ]);

    const inputHash = buildInputHash({ thread: input.thread, sequence: input.sequence });
    const settled = pickSettledForget({ live, earlier, inputHash, callerID: caller.identityID });

    if (settled !== null) {
      return settled;
    }

    const forgottenAt = await writeForgetStart(tx, context, input);

    if (forgottenAt === null) {
      return { status: 'not_found' } as const;
    }

    await writeClientAction(tx, {
      clientActionID: input.clientActionID,
      procedure: 'conversation.forget',
      identityID: caller.identityID,
      inputHash,
      result: { forgottenAt },
      recordedAt: context.clock.now(),
    });

    return { status: 'forgotten', forgottenAt } as const;
  });

  if (result.status === 'forgotten') {
    await runRecordForgetCleanup(context, input.sequence);
  }

  return result;
}

interface ForgetState {
  readonly live: boolean;
  readonly earlier: ClientAction | null;
  readonly inputHash: string;
  readonly callerID: string;
}

// the answer a call gets without a write: refused for a caller no longer live, and for an ID that
// came before, its first result for the same caller and input, or a refusal as reused
function pickSettledForget(state: ForgetState): RecordForgetResult | null {
  if (!state.live) {
    return { status: 'unauthorized' };
  }

  if (state.earlier === null) {
    return null;
  }

  return state.earlier.procedure === 'conversation.forget' &&
    state.earlier.identityID === state.callerID &&
    state.earlier.inputHash === state.inputHash
    ? { status: 'forgotten', forgottenAt: Number(state.earlier.result['forgottenAt']) }
    : { status: 'reused' };
}
