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
