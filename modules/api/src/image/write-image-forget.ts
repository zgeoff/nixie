import type { ImageForgetTarget, ImageForgetTargets } from '@heynixie/connectors';
import { CodeSandboxDestroyError, readImageForgetTargets } from '@heynixie/connectors';
import { withWriteTransaction } from '@heynixie/log';
import { ORPCError } from '@orpc/server';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { runRecordForgetCleanup } from '../record/run-record-forget-cleanup';
import { writeRecordForgetStart } from '../record/write-record-forget-start';
import type { APIContext, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { readRecordForget } from '../utils/read-record-forget';
import { writeClientAction } from '../utils/write-client-action';

const procedure = 'images.forget';

interface ImageForgetInput {
  readonly clientActionID: string;

  // the short ID or the UUID of the image
  readonly image: string;
}

export type ImageForgetResult =
  | {
      readonly status: 'forgotten';
      readonly forgottenAt: number;
      readonly targets: readonly ImageForgetTarget[];
    }
  | { readonly status: 'action_not_finished' }
  | { readonly status: 'not_found' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

const storedTargetSchema = z.object({ thread: z.string(), sequence: z.int() });

const storedForgetSchema = z.object({
  forgottenAt: z.number(),
  targets: z.array(storedTargetSchema),
});

// A retry cleans up the kept list as well as the records read now, because a record whose key went
// before a failed cleanup no longer reads as the image's.
export async function writeImageForget(
  context: APIContext,
  caller: Identity,
  input: ImageForgetInput,
): Promise<ImageForgetResult> {
  const result = await withWriteTransaction(context.log.writer, async (tx) => {
    const [live, earlier] = await Promise.all([
      probeLiveIdentity(tx, context, caller.identityID),
      readClientAction(tx, input.clientActionID),
    ]);

    if (!live) {
      return { status: 'unauthorized' } as const;
    }

    const forgettable = await readImageForgetTargets(buildTransactionLog(context, tx), input.image);

    if (forgettable === null) {
      return { status: 'not_found' } as const;
    }

    const inputHash = buildInputHash({ image: forgettable.image });

    if (earlier !== null) {
      const stored = storedForgetSchema.safeParse(earlier.result);

      if (
        earlier.procedure !== procedure ||
        earlier.identityID !== caller.identityID ||
        earlier.inputHash !== inputHash ||
        !stored.success
      ) {
        return { status: 'reused' } as const;
      }

      // A record written since the first call, such as a list that read the name, joins the forget.
      const retried = await writeStarts(tx, context, forgettable);

      if (retried.status !== 'forgotten') {
        return retried;
      }

      const targets = collectMergedTargets(stored.data.targets, forgettable.targets);

      await writeKeptTargets(tx, context, {
        clientActionID: input.clientActionID,
        identityID: caller.identityID,
        inputHash,
        forgottenAt: stored.data.forgottenAt,
        targets,
      });

      return {
        status: 'forgotten',
        forgottenAt: stored.data.forgottenAt,
        image: forgettable.image,
        targets,
      } as const;
    }

    const started = await writeStarts(tx, context, forgettable);

    if (started.status !== 'forgotten') {
      return started;
    }

    await writeKeptTargets(tx, context, {
      clientActionID: input.clientActionID,
      identityID: caller.identityID,
      inputHash,
      forgottenAt: started.forgottenAt,
      targets: forgettable.targets,
    });

    return { ...started, image: forgettable.image, targets: forgettable.targets } as const;
  });

  if (result.status !== 'forgotten') {
    return result;
  }

  const late = await runCleanups(context, {
    clientActionID: input.clientActionID,
    identityID: caller.identityID,
    image: result.image,
    forgottenAt: result.forgottenAt,
    targets: result.targets,
  });

  return late.status === 'forgotten'
    ? { status: 'forgotten', forgottenAt: result.forgottenAt, targets: late.targets }
    : late;
}

function buildTransactionLog(context: APIContext, tx: Transaction<unknown>) {
  return { deploymentKey: context.log.deploymentKey, writer: { ...context.log.writer, db: tx } };
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
): Promise<StartsResult> {
  const fresh: number[] = [];
  const earlier: number[] = [];

  for (const target of forgettable.targets) {
    const begun = await readRecordForget(tx, {
      kind: 'record.forget_started',
      sequence: target.sequence,
    });

    const start = await writeRecordForgetStart(tx, context, target, []);

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

// The kept list and the records read now, once each, in the order of the log.
function collectMergedTargets(
  kept: readonly ImageForgetTarget[],
  fresh: readonly ImageForgetTarget[],
): ImageForgetTarget[] {
  const bySequence = new Map<number, ImageForgetTarget>();

  for (const target of [...kept, ...fresh]) {
    bySequence.set(target.sequence, toStoredTarget(target));
  }

  return [...bySequence.values()].toSorted((left, right) => left.sequence - right.sequence);
}

function toStoredTarget(target: ImageForgetTarget) {
  return { thread: target.thread, sequence: target.sequence };
}

interface KeptTargets {
  readonly clientActionID: string;
  readonly identityID: string;
  readonly inputHash: string;
  readonly forgottenAt: number;
  readonly targets: readonly ImageForgetTarget[];
}

function writeKeptTargets(
  tx: Transaction<unknown>,
  context: APIContext,
  kept: KeptTargets,
): Promise<void> {
  return writeClientAction(tx, {
    clientActionID: kept.clientActionID,
    procedure,
    identityID: kept.identityID,
    inputHash: kept.inputHash,
    result: { forgottenAt: kept.forgottenAt, targets: kept.targets.map(toStoredTarget) },
    recordedAt: context.clock.now(),
  });
}

interface CleanupRun {
  readonly clientActionID: string;
  readonly identityID: string;

  // the short ID of the image
  readonly image: string;
  readonly forgottenAt: number;
  readonly targets: readonly ImageForgetTarget[];
}

type CleanupResult =
  | { readonly status: 'forgotten'; readonly targets: readonly ImageForgetTarget[] }
  | { readonly status: 'action_not_finished' }
  | { readonly status: 'not_found' };

// Runs the cleanup of each target, then reads the image's records again and starts and cleans up any
// record that a call wrote while the cleanups ran, until a read finds none.
async function runCleanups(context: APIContext, run: CleanupRun): Promise<CleanupResult> {
  let pending = run.targets;
  let handled: readonly ImageForgetTarget[] = [];

  while (pending.length > 0) {
    await runTargetCleanups(context, pending);

    handled = collectMergedTargets(handled, pending);

    const late = await writeLateStarts(context, run, handled);

    if (late.status !== 'forgotten') {
      return late;
    }

    pending = late.targets;
  }

  return { status: 'forgotten', targets: handled };
}

// A code sandbox that will not go fails the forget with the sentence that tells the owner to try
// again, through the API's error path for an unexpected failure.
async function runTargetCleanups(
  context: APIContext,
  targets: readonly ImageForgetTarget[],
): Promise<void> {
  try {
    for (const target of targets) {
      await runRecordForgetCleanup(context, target.sequence);
    }
  } catch (error) {
    if (error instanceof CodeSandboxDestroyError) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: error.message, cause: error });
    }

    throw error;
  }
}

function writeLateStarts(
  context: APIContext,
  run: CleanupRun,
  handled: readonly ImageForgetTarget[],
): Promise<CleanupResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const found = await readImageForgetTargets(buildTransactionLog(context, tx), run.image);

    const late = collectLateTargets(found?.targets ?? [], handled);

    if (late.length === 0) {
      return { status: 'forgotten', targets: [] } as const;
    }

    const started = await writeStarts(tx, context, { image: run.image, targets: late });

    if (started.status !== 'forgotten') {
      return started;
    }

    await writeKeptTargets(tx, context, {
      clientActionID: run.clientActionID,
      identityID: run.identityID,
      inputHash: buildInputHash({ image: run.image }),
      forgottenAt: run.forgottenAt,
      targets: collectMergedTargets(handled, late),
    });

    return { status: 'forgotten', targets: late } as const;
  });
}

// The records read now that no cleanup has taken yet.
function collectLateTargets(
  found: readonly ImageForgetTarget[],
  handled: readonly ImageForgetTarget[],
): ImageForgetTarget[] {
  const handledSequences = new Set(handled.map((target) => target.sequence));

  return found.filter((target) => !handledSequences.has(target.sequence));
}
