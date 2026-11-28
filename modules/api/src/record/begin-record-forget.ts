import type { ErasureBy } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { WriteInTransaction } from '@heynixie/memory';
import invariant from 'tiny-invariant';
import type { APIContext, RecordForgets } from '../types';
import { readRecordForget } from '../utils/read-record-forget';
import type { RecordForgetCheck } from './read-record-forget-check';
import { readRecordForgetCheck } from './read-record-forget-check';

interface RecordTarget {
  readonly thread: string;
  readonly sequence: number;
}

export type RecordForgetBegin =
  | { readonly status: 'begun' }
  | Exclude<RecordForgetCheck, { readonly status: 'ok' }>;

export interface RecordForgetBeginOptions {
  readonly by: ErasureBy;

  // the caller's client action, which commits with the start or not at all
  readonly writeInTransaction?: WriteInTransaction;
}

// The first part of a record's forget alone: one transaction runs the caller's hook, checks the
// record and writes erasure.started. A record whose forget began already answers begun and starts
// nothing, and still keeps the caller's client action.
export async function beginRecordForget(
  context: APIContext,
  target: RecordTarget,
  options: RecordForgetBeginOptions,
): Promise<RecordForgetBegin> {
  const forgets = readRecordForgets(context);

  const check = await readRecordForgetCheck(context.log.writer.db, target);

  const earlier = await readRecordForget(context.log.writer.db, {
    kind: 'record.forget_started',
    sequence: target.sequence,
  });

  if (check.status !== 'ok' && (earlier === null || check.status !== 'action_not_finished')) {
    return check;
  }

  if (earlier === null) {
    const begun = await forgets.record.begin(target, options);

    if (begun.status === 'begun') {
      return { status: 'begun' };
    }

    if (begun.reason !== 'already_begun') {
      return {
        status: begun.reason === 'action_not_finished' ? 'action_not_finished' : 'not_found',
      };
    }
  }

  if (options.writeInTransaction !== undefined) {
    await withWriteTransaction(context.log.writer, options.writeInTransaction);
  }

  return { status: 'begun' };
}

export function readRecordForgets(context: APIContext): RecordForgets {
  const forgets = context.readForgets?.() ?? null;

  invariant(forgets, 'the erasure runner is started when a record is forgotten');

  return forgets;
}
