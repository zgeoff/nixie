import { CodeSandboxDestroyError, readImageForgetTargets } from '@heynixie/connectors';
import { readErasureFinishedSequence, readErasures, withWriteTransaction } from '@heynixie/log';
import { ORPCError } from '@orpc/server';
import { readRecordForgets } from '../record/begin-record-forget';
import type { APIContext, ForgetProgress, Identity } from '../types';
import { writeMemoryChange } from '../utils/write-memory-change';
import { readEarlierImageForget } from './read-earlier-image-forget';

interface ImageForgetInput {
  readonly clientActionID: string;

  // the short ID or the UUID of the image
  readonly image: string;
}

export type ImageForgetResult =
  | {
      readonly status: 'forgotten';
      readonly forgottenAt: number;
      readonly progress: ForgetProgress;
    }
  | { readonly status: 'action_not_finished' }
  | { readonly status: 'not_found' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

// Forgets an image to its end: the erasure of the image takes every record that holds, names or
// quotes it. A retry with the same client action ID finishes what the first call left open and
// answers the time of the first call.
export async function writeImageForget(
  context: APIContext,
  caller: Identity,
  input: ImageForgetInput,
): Promise<ImageForgetResult> {
  const found = await readImageForgetTargets(context.log, input.image);

  if (found === null) {
    return { status: 'not_found' };
  }

  const forgets = readRecordForgets(context);
  const refusal: { reason: 'not_found' | 'action_not_finished' | null } = { reason: null };

  const outcome = await writeMemoryChange(context, caller, {
    clientActionID: input.clientActionID,
    procedure: 'images.forget',
    input: { image: found.image },
    result: {},
    apply: async (writeInTransaction) => {
      const begun = await forgets.image.begin(
        { image: found.image },
        { by: 'user', writeInTransaction },
      );

      if (begun.status === 'begun' || begun.reason === 'already_begun') {
        // an open forget of the image keeps the caller's client action as the first call did
        if (begun.status === 'refused') {
          await withWriteTransaction(context.log.writer, writeInTransaction);
        }

        return;
      }

      refusal.reason = begun.reason === 'action_not_finished' ? 'action_not_finished' : 'not_found';
    },
  });

  if (outcome !== 'applied') {
    return { status: outcome };
  }

  if (refusal.reason !== null) {
    return { status: refusal.reason };
  }

  await finishImageForget(forgets.image.finish, found.uuid);

  const [first] = await readErasures(context.log, { kind: 'image', targetID: found.uuid });

  if (first === undefined) {
    const earlier = await readEarlierImageForget(context, input.clientActionID);

    return {
      status: 'forgotten',
      forgottenAt: earlier?.forgottenAt ?? context.clock.now(),
      progress: earlier?.progress ?? { stage: 'deleting' },
    };
  }

  const finishedAt = await readErasureFinishedSequence(context.log, 'image', found.uuid);

  return {
    status: 'forgotten',
    forgottenAt: first.startedAtMs,
    progress:
      finishedAt === null ? { stage: 'deleting' } : { stage: 'forgotten', sequence: finishedAt },
  };
}

// A code sandbox that will not go fails the forget with the sentence that tells the owner to try
// again, through the API's error path for an unexpected failure.
async function finishImageForget(
  finish: (targetID: string) => Promise<void>,
  imageUUID: string,
): Promise<void> {
  try {
    await finish(imageUUID);
  } catch (error) {
    if (error instanceof CodeSandboxDestroyError) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: error.message, cause: error });
    }

    throw error;
  }
}
