import { z } from 'zod';
import { readRecordForgetProgress } from '../record/read-record-forget-progress';
import type { APIContext, ForgetProgress } from '../types';
import { readClientAction } from '../utils/read-client-action';

const storedTargetSchema = z.object({ sequence: z.int() });

const storedForgetSchema = z.object({
  forgottenAt: z.number(),
  targets: z.array(storedTargetSchema),
});

export interface EarlierImageForget {
  readonly forgottenAt: number;
  readonly progress: ForgetProgress;
}

// What an earlier release kept for a client action that forgot an image through the old record
// forgets: the time of its first start, and the records it forgot. Null when the action kept none,
// as an action of the erasure runner does.
export async function readEarlierImageForget(
  context: APIContext,
  clientActionID: string,
): Promise<EarlierImageForget | null> {
  const earlier = await readClientAction(context.log.writer.db, clientActionID);

  const stored = storedForgetSchema.safeParse(earlier?.result);

  if (!stored.success) {
    return null;
  }

  const progresses = await Promise.all(
    stored.data.targets.map((target) => readRecordForgetProgress(context, target.sequence)),
  );

  return { forgottenAt: stored.data.forgottenAt, progress: pickImageForgetProgress(progresses) };
}

// One progress for the records of an image forget: deleting while any record is, else the latest
// sequence that any record's backup waits on, else forgotten with no key left to prune.
function pickImageForgetProgress(progresses: readonly ForgetProgress[]): ForgetProgress {
  if (progresses.some((progress) => progress.stage === 'deleting')) {
    return { stage: 'deleting' };
  }

  const sequences = progresses.flatMap((progress) =>
    progress.stage === 'forgotten' && progress.sequence !== null ? [progress.sequence] : [],
  );

  return { stage: 'forgotten', sequence: sequences.length === 0 ? null : Math.max(...sequences) };
}
