import { conversationTaskID } from '@heynixie/tasks';
import type { Kysely } from 'kysely';
import type { MomentTables } from './moment-types';

export interface MomentWeekCount {
  readonly total: number;
  readonly byConversation: number;
  readonly byTasks: number;
  readonly byOwner: number;

  // the moments of the week that hold no reflection yet
  readonly waitingForReflection: number;
}

const momentWeekMs = 7 * 24 * 60 * 60 * 1000;

// The week is the 7 days up to the instant asked about, across every thread, so a replay of an
// older event counts the week as it stood then.
export async function readWeekCount(
  db: Kysely<MomentTables>,
  at: number,
): Promise<MomentWeekCount> {
  const rows = await db
    .selectFrom('moments')
    .select((eb) => [
      'kept_by',
      'kept_thread',
      eb
        .exists(
          eb
            .selectFrom('moment_reflections')
            .select('reflection_id')
            .whereRef('moment_reflections.moment_id', '=', 'moments.moment_id')
            .where('is_removed', '=', 0),
        )
        .as('has_reflection'),
    ])
    .where('kept_at', '>', at - momentWeekMs)
    .where('kept_at', '<=', at)
    .where('state', 'in', ['active', 'retired'])
    .execute();

  const byConversation = rows.filter(
    (row) => row.kept_by === 'model' && row.kept_thread === conversationTaskID,
  ).length;

  const byOwner = rows.filter((row) => row.kept_by === 'owner').length;

  return {
    total: rows.length,
    byConversation,
    byTasks: rows.length - byConversation - byOwner,
    byOwner,
    waitingForReflection: rows.filter((row) => row.has_reflection === 0).length,
  };
}
