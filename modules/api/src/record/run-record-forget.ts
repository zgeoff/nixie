import type { ErasureBy } from '@heynixie/log';
import type { APIContext } from '../types';
import { readRecordForget } from '../utils/read-record-forget';
import { beginRecordForget, readRecordForgets } from './begin-record-forget';
import type { RecordForgetCheck } from './read-record-forget-check';

interface RecordTarget {
  readonly thread: string;
  readonly sequence: number;
}

export type RecordForgetStart =
  | { readonly status: 'forgotten'; readonly forgottenAt: number }
  | Exclude<RecordForgetCheck, { readonly status: 'ok' }>;

// Forgets one record to its end, with no check of who asks. Run again after a completed forget, it
// answers forgotten with the time of the first start and changes nothing.
export async function runRecordForget(
  context: APIContext,
  target: RecordTarget,
  by: ErasureBy = 'user',
): Promise<RecordForgetStart> {
  const begun = await beginRecordForget(context, target, { by });

  if (begun.status !== 'begun') {
    return begun;
  }

  return finishRecordForget(context, target.sequence);
}

// Steps 2 to 9 of the forget, and the time that it began.
export async function finishRecordForget(
  context: APIContext,
  sequence: number,
): Promise<Extract<RecordForgetStart, { status: 'forgotten' }>> {
  await readRecordForgets(context).record.finish(String(sequence));

  const started = await readRecordForget(context.log.writer.db, {
    kind: 'record.forget_started',
    sequence,
  });

  return { status: 'forgotten', forgottenAt: started?.recordedAt ?? context.clock.now() };
}
