import { forgettableKinds } from '@heynixie/contract';
import type { RecordKind } from '@heynixie/log';
import { probeOpenPlaceRecord } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import type { APITables } from '../types';
import { unthreadedPlaceKinds } from '../utils/unthreaded-place-kinds';
import { probeUnfinishedQueuedAction } from './probe-unfinished-queued-action';

interface RecordTarget {
  readonly thread: string;
  readonly sequence: number;
}

export type RecordForgetCheck =
  | { readonly status: 'ok'; readonly kind: RecordKind }
  | { readonly status: 'action_not_finished' }
  | { readonly status: 'not_found' }
  | { readonly status: 'wrong_kind'; readonly kind: RecordKind };

const kinds: ReadonlySet<string> = new Set(forgettableKinds);

// Tells whether the record can be forgotten, and if not, why. A record that already began its
// forget passes.
export async function readRecordForgetCheck(
  db: Kysely<unknown>,
  target: RecordTarget,
): Promise<RecordForgetCheck> {
  const isActionUnfinished = await probeUnfinishedQueuedAction(db, target);

  if (isActionUnfinished) {
    return { status: 'action_not_finished' };
  }

  const row = await db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('kind')
    .where('sequence', '=', target.sequence)
    .where((eb) =>
      eb.or([
        eb('thread', '=', target.thread),
        eb.and([eb('thread', 'is', null), eb('kind', 'in', unthreadedPlaceKinds)]),
      ]),
    )
    .executeTakeFirst();

  if (row === undefined) {
    return { status: 'not_found' };
  }

  return kinds.has(row.kind) && !(await probeOpenPlaceRecord(db, target.sequence))
    ? { status: 'ok', kind: row.kind }
    : { status: 'wrong_kind', kind: row.kind };
}
