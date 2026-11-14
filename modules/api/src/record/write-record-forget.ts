import { withWriteTransaction } from '@heynixie/log';
import { writeForgetStart } from '../forget/write-forget-start';
import type { APIContext, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import type { ClientAction } from '../utils/read-client-action';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';
import { probeUnfinishedQueuedAction } from './probe-unfinished-queued-action';
import { readBriefStartCalls } from './read-brief-start-calls';
import { readReportRecords } from './read-report-records';
import { runRecordForgetCleanup } from './run-record-forget-cleanup';

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
  // The search reads the brief's text, which the cleanup destroys, so it runs before the forget
  // starts and the forget's start record keeps what it found.
  const briefCalls = await readBriefStartCalls(context, input.sequence);
  const reportRecords = await readReportRecords(context, input.sequence);

  // The start record names each other record that the forget destroys with its target, whatever
  // part of a task's work it holds.
  const startCalls = [...briefCalls, ...reportRecords].toSorted((left, right) => left - right);

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

    const isActionUnfinished = await probeUnfinishedQueuedAction(tx, input);

    if (isActionUnfinished) {
      return { status: 'action_not_finished' } as const;
    }

    const forgottenAt = await writeForgetStart(tx, context, input, startCalls);

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
