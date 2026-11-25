import type { Log } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { heldAnswersSchema } from '../projection/held-answers-schema';
import { sessionStateSchema } from '../record/session-state-schema';
import { wakeEventSchema } from '../record/wake-event-schema';
import type { Binding, CodingTables } from '../types';

// The session that a coding task binds, or null before the task has bound one.
export async function readBinding(
  db: Log['writer']['db'] | Transaction<unknown>,
  taskID: string,
): Promise<Binding | null> {
  const row = await db
    .$extendTables<CodingTables>()
    .selectFrom('coding_sessions')
    .selectAll()
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  return row === undefined ? null : toBinding(row);
}

const bindingStateSchema = z.union([sessionStateSchema, z.literal('starting')]);

export function toBinding(row: CodingTables['coding_sessions']): Binding {
  return {
    taskID: row.task_id,
    adapter: row.adapter,
    sessionID: row.session_id,
    origin: row.origin,
    state: bindingStateSchema.parse(row.state),
    wake: z.array(wakeEventSchema).parse(JSON.parse(row.wake)),
    hop: row.hop,
    fromCursor: row.from_cursor,
    lastEventAt: row.last_event_at,
    unboundAt: row.unbound_at,
    heldAnswers: heldAnswersSchema.parse(JSON.parse(row.held_answers)),
  };
}
