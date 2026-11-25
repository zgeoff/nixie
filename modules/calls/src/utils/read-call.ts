import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Call, CallRow, CallsTables } from '../types';
import { callEndedBys } from './call-ended-by';

// null for a call ID that no call has
export async function readCall(db: Kysely<unknown>, callID: string): Promise<Call | null> {
  const row = await db
    .$extendTables<CallsTables>()
    .selectFrom('calls')
    .selectAll()
    .where('call_id', '=', callID)
    .executeTakeFirst();

  return row === undefined ? null : toCall(row);
}

// The call that is not over, which is at most one because nixie works for one person.
export async function readRunningCall(db: Kysely<unknown>): Promise<Call | null> {
  const row = await db
    .$extendTables<CallsTables>()
    .selectFrom('calls')
    .selectAll()
    .where('state', '!=', 'ended')
    .orderBy('started_at')
    .executeTakeFirst();

  return row === undefined ? null : toCall(row);
}

// The calls that are not over.
export async function readOpenCalls(db: Kysely<unknown>): Promise<readonly Call[]> {
  const rows = await db
    .$extendTables<CallsTables>()
    .selectFrom('calls')
    .selectAll()
    .where('state', '!=', 'ended')
    .orderBy('started_at')
    .execute();

  return rows.map((row) => toCall(row));
}

const rowSchema = z.object({
  call_id: z.string(),
  task_id: z.string(),
  state: z.enum(['ringing', 'connecting', 'live', 'ended']),
  started_by: z.enum(['you', 'nixie']),
  carrying_session: z.string(),
  started_at: z.number(),
  connected_at: z.number().nullable(),
  ended_at: z.number().nullable(),
  ended_by: z.enum(callEndedBys).nullable(),
  minutes: z.number(),
});

function toCall(row: CallRow): Call {
  const parsed = rowSchema.parse(row);

  return {
    callID: parsed.call_id,
    taskID: parsed.task_id,
    state: parsed.state,
    startedBy: parsed.started_by,
    carryingSession: parsed.carrying_session,
    startedAtMs: parsed.started_at,
    connectedAtMs: parsed.connected_at,
    endedAtMs: parsed.ended_at,
    endedBy: parsed.ended_by,
    minutes: parsed.minutes,
  };
}
