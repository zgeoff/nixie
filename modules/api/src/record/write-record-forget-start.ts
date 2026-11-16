import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { writeForgetStart } from '../forget/write-forget-start';
import type { APIContext } from '../types';
import type { RecordForgetCheck } from './read-record-forget-check';
import { readRecordForgetCheck } from './read-record-forget-check';

interface RecordTarget {
  readonly thread: string;
  readonly sequence: number;
}

export type RecordForgetStart =
  | { readonly status: 'forgotten'; readonly forgottenAt: number }
  | Exclude<RecordForgetCheck, { readonly status: 'ok' }>;

// Starts the forget of the record, or answers why it cannot. A record that already began its forget
// answers forgotten with the time of the first start and writes nothing.
export async function writeRecordForgetStart(
  tx: Transaction<unknown>,
  context: APIContext,
  target: RecordTarget,
  startCalls: readonly number[],
): Promise<RecordForgetStart> {
  const check = await readRecordForgetCheck(tx, target);

  if (check.status !== 'ok') {
    return check;
  }

  const forgottenAt = await writeForgetStart(tx, context, target, startCalls);

  invariant(forgottenAt !== null, 'a record that passed the check starts its forget');

  return { status: 'forgotten', forgottenAt };
}
