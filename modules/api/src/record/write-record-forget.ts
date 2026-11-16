import { CodeSandboxDestroyError } from '@heynixie/connectors';
import { withWriteTransaction } from '@heynixie/log';
import { ORPCError } from '@orpc/server';
import type { APIContext, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import type { ClientAction } from '../utils/read-client-action';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';
import { readRecordStartCalls } from './read-record-start-calls';
import { runRecordForgetCleanup } from './run-record-forget-cleanup';
import { writeRecordForgetStart } from './write-record-forget-start';

interface RecordForgetInput {
  readonly clientActionID: string;
  readonly thread: string;
  readonly sequence: number;
}

type RecordForgetResult =
  | { readonly status: 'forgotten'; readonly forgottenAt: number }
  | { readonly status: 'action_not_finished' }
  | { readonly status: 'not_found' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

export async function writeRecordForget(
  context: APIContext,
  caller: Identity,
  input: RecordForgetInput,
): Promise<RecordForgetResult> {
  const startCalls = await readRecordStartCalls(context, input.sequence);

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

    const start = await writeRecordForgetStart(tx, context, input, startCalls);

    if (start.status === 'action_not_finished') {
      return start;
    }

    if (start.status !== 'forgotten') {
      return { status: 'not_found' } as const;
    }

    await writeClientAction(tx, {
      clientActionID: input.clientActionID,
      procedure: 'conversation.forget',
      identityID: caller.identityID,
      inputHash,
      result: { forgottenAt: start.forgottenAt },
      recordedAt: context.clock.now(),
    });

    return start;
  });

  if (result.status === 'forgotten') {
    await runForgetCleanup(context, input.sequence);
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

// A code sandbox that will not go fails the forget with the sentence that tells the owner to try
// again, through the API's error path for an unexpected failure.
async function runForgetCleanup(context: APIContext, sequence: number): Promise<void> {
  try {
    await runRecordForgetCleanup(context, sequence);
  } catch (error) {
    if (error instanceof CodeSandboxDestroyError) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: error.message, cause: error });
    }

    throw error;
  }
}
