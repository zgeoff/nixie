import { parseJSONObject } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { taskLimitReachedCodec } from './task-limit-reached-codec';
import { taskLimitsRaisedCodec } from './task-limits-raised-codec';
import type { TaskLimits, TasksTables } from './types';

export interface LimitRecords {
  readonly raised: TaskLimits | null;

  readonly heldAt: TaskLimits | null;
}

// The caller passes its write transaction when it acts on the answer, so the hold it reads cannot
// change before its own write commits.
export async function readLimitRecords(db: Kysely<unknown>, taskID: string): Promise<LimitRecords> {
  const records = db.$extendTables<TasksTables>();

  const newest = await records
    .selectFrom('records')
    .select(['kind', 'payload'])
    .where('thread', '=', taskID)
    .where('kind', 'in', ['task.limit_reached', 'task.limits_raised'])
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  const raise = await records
    .selectFrom('records')
    .select('payload')
    .where('thread', '=', taskID)
    .where('kind', '=', 'task.limits_raised')
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return {
    raised:
      raise === undefined
        ? null
        : taskLimitsRaisedCodec.decode(parseJSONObject(raise.payload)).limits,
    heldAt:
      newest?.kind === 'task.limit_reached'
        ? taskLimitReachedCodec.decode(parseJSONObject(newest.payload)).limits
        : null,
  };
}
