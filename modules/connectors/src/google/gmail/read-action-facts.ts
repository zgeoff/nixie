import type { Log } from '@heynixie/log';
import { sql } from 'kysely';
import { z } from 'zod';

export interface ActionFacts {
  // the thread of the call that queued the action, whose files the action may send
  readonly thread: string;

  // epoch ms of the action's first attempt, which a retry and a reconcile share; null before any
  readonly firstAttemptAt: number | null;
}

const rowSchema = z.object({
  task_id: z.string(),
  first_attempt_at: z.number().nullable(),
  thread: z.string().nullable(),
});

// What the action queue holds about an action that a Gmail tool queued. The queue's own tables stay
// the queue's: this reads one row of them by the action's ID.
export async function readActionFacts(
  log: Pick<Log, 'writer'>,
  actionID: string,
): Promise<ActionFacts | null> {
  const result = await sql`
    select actions.task_id, actions.first_attempt_at, records.thread
    from actions
    left join records on records.sequence = actions.queued_sequence
    where actions.action_id = ${actionID}
  `.execute(log.writer.db);

  const [first] = result.rows;
  const row = rowSchema.safeParse(first);

  return row.success
    ? { thread: row.data.thread ?? row.data.task_id, firstAttemptAt: row.data.first_attempt_at }
    : null;
}
