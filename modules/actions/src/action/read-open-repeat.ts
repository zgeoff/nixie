import type { JSONObject } from '@heynixie/log';
import type { OpenRepeat } from '@heynixie/tools';
import type { Kysely } from 'kysely';
import type { ActionsTables } from '../types';
import { buildActionHash } from './build-action-hash';
import { buildCancelledCheck } from './build-cancelled-check';

export interface OpenRepeatQuery {
  readonly taskID: string;
  readonly tool: string;
  readonly arguments: JSONObject;
  readonly actionHash: string;
}

// The pending or unknown action of the task that the same call already queued, if any.
export async function readOpenRepeat(
  db: Kysely<unknown>,
  query: OpenRepeatQuery,
): Promise<OpenRepeat | null> {
  const open = await db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['action_id', 'runs_in_step'])
    .where('task_id', '=', query.taskID)

    // an action queued before the hash covered the destinations holds the older hash
    .where('action_hash', 'in', [query.actionHash, buildActionHash(query.tool, query.arguments)])
    .where('status', 'in', ['pending', 'unknown'])
    .where((eb) => eb.not(buildCancelledCheck(eb)))
    .orderBy('queued_sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return open === undefined
    ? null
    : { actionID: open.action_id, runsInStep: open.runs_in_step === 1 };
}
