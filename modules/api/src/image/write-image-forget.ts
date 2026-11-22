import type { ImageForgetTargets } from '@heynixie/connectors';
import { CodeSandboxDestroyError } from '@heynixie/connectors';
import { withWriteTransaction } from '@heynixie/log';
import { ORPCError } from '@orpc/server';
import type { Transaction } from 'kysely';
import { readForgetBackupState } from '../forget/read-forget-backup-state';
import { readRecordForgetProgress } from '../record/read-record-forget-progress';
import { readRecordStartCalls } from '../record/read-record-start-calls';
import { runRecordForgetCleanup } from '../record/run-record-forget-cleanup';
import { writeRecordForgetStart } from '../record/write-record-forget-start';
import type { APIContext, ForgetBackupState, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { readRecordForget } from '../utils/read-record-forget';
import { writeClientAction } from '../utils/write-client-action';
import { pickImageForgetBackup } from './pick-image-forget-backup';

const procedure = 'images.forget';

interface ImageForgetInput {
  readonly clientActionID: string;
  readonly forgettable: ImageForgetTargets;
}

export type ImageForgetResult =
  | { readonly status: 'forgotten'; readonly forgottenAt: number }
  | { readonly status: 'action_not_finished' }
  | { readonly status: 'not_found' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

// Forgets every record of the image as one forget: one transaction starts each record's forget, and
// the cleanup then runs for each. A retry with the same client action ID runs the cleanups again,
// which finish what a failed call left.
export async function writeImageForget(
  context: APIContext,
  caller: Identity,
  input: ImageForgetInput,
): Promise<ImageForgetResult> {
  const startCalls = await Promise.all(
    input.forgettable.targets.map((target) => readRecordStartCalls(context, target.sequence)),
  );

  const result = await withWriteTransaction(context.log.writer, async (tx) => {
    const [live, earlier] = await Promise.all([
      probeLiveIdentity(tx, context, caller.identityID),
      readClientAction(tx, input.clientActionID),
    ]);

    if (!live) {
      return { status: 'unauthorized' } as const;
    }

    const inputHash = buildInputHash({ image: input.forgettable.image });

    if (earlier !== null) {
      return earlier.procedure === procedure &&
        earlier.identityID === caller.identityID &&
        earlier.inputHash === inputHash
        ? ({ status: 'forgotten', forgottenAt: Number(earlier.result['forgottenAt']) } as const)
        : ({ status: 'reused' } as const);
    }

    const started = await writeStarts(tx, context, input.forgettable, startCalls);

    if (started.status !== 'forgotten') {
      return started;
    }

    await writeClientAction(tx, {
      clientActionID: input.clientActionID,
      procedure,
      identityID: caller.identityID,
      inputHash,
      result: { forgottenAt: started.forgottenAt },
      recordedAt: context.clock.now(),
    });

    return started;
  });

  if (result.status === 'forgotten') {
    await runCleanups(context, input.forgettable);
  }

  return result;
}

// The backup state of the records' forgets, after their cleanups ran.
export async function readImageForgetBackup(
  context: APIContext,
  forgettable: ImageForgetTargets,
): Promise<ForgetBackupState> {
  const states = await Promise.all(
    forgettable.targets.map(async (target) => {
      const progress = await readRecordForgetProgress(context, target.sequence);

      return readForgetBackupState(context, progress);
    }),
  );

  return pickImageForgetBackup(states);
}

type StartsResult =
  | { readonly status: 'forgotten'; readonly forgottenAt: number }
  | { readonly status: 'action_not_finished' }
  | { readonly status: 'not_found' };

// A record that began its forget before keeps the time of that start. The answer is the time of
// this call's own starts, or the time of the first forget when every record had begun already.
async function writeStarts(
  tx: Transaction<unknown>,
  context: APIContext,
  forgettable: ImageForgetTargets,
  startCalls: readonly (readonly number[])[],
): Promise<StartsResult> {
  const fresh: number[] = [];
  const earlier: number[] = [];

  for (const [index, target] of forgettable.targets.entries()) {
    const begun = await readRecordForget(tx, {
      kind: 'record.forget_started',
      sequence: target.sequence,
    });

    const start = await writeRecordForgetStart(tx, context, target, startCalls[index] ?? []);

    if (start.status === 'action_not_finished') {
      return start;
    }

    if (start.status !== 'forgotten') {
      return { status: 'not_found' };
    }

    (begun === null ? fresh : earlier).push(start.forgottenAt);
  }

  const times = fresh.length > 0 ? fresh : earlier;

  return times.length === 0
    ? { status: 'not_found' }
    : { status: 'forgotten', forgottenAt: Math.min(...times) };
}

// A code sandbox that will not go fails the forget with the sentence that tells the owner to try
// again, through the API's error path for an unexpected failure.
async function runCleanups(context: APIContext, forgettable: ImageForgetTargets): Promise<void> {
  try {
    for (const target of forgettable.targets) {
      await runRecordForgetCleanup(context, target.sequence);
    }
  } catch (error) {
    if (error instanceof CodeSandboxDestroyError) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: error.message, cause: error });
    }

    throw error;
  }
}
