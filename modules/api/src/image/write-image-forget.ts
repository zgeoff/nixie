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

// Forgets every record of the image as one forget. One transaction finds the records, starts each
// forget and keeps the list with the client action. A retry reads the records again inside its own transaction, so it takes in a record written since,
// and runs the cleanups of the whole list.
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

    const forgettable = await readImageForgetTargets(
      { deploymentKey: context.log.deploymentKey, writer: { ...context.log.writer, db: tx } },
      input.image,
    );

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

      return retried.status === 'forgotten'
        ? ({
            status: 'forgotten',
            forgottenAt: stored.data.forgottenAt,
            targets: forgettable.targets,
          } as const)
        : retried;
    }

    const started = await writeStarts(tx, context, forgettable);

    if (started.status !== 'forgotten') {
      return started;
    }

    const kept = forgettable.targets.map(toStoredTarget);

    await writeClientAction(tx, {
      clientActionID: input.clientActionID,
      procedure,
      identityID: caller.identityID,
      inputHash,
      result: { forgottenAt: started.forgottenAt, targets: kept },
      recordedAt: context.clock.now(),
    });

    return { ...started, targets: forgettable.targets } as const;
  });

  if (result.status === 'forgotten') {
    await runCleanups(context, result.targets);
  }

  return result;
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

function toStoredTarget(target: ImageForgetTarget) {
  return { thread: target.thread, sequence: target.sequence };
}

// A code sandbox that will not go fails the forget with the sentence that tells the owner to try
// again, through the API's error path for an unexpected failure.
async function runCleanups(
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
