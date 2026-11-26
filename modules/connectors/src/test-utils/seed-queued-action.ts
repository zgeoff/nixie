import type { Log } from '@heynixie/log';
import { sql } from 'kysely';

interface QueuedActionFacts {
  readonly actionID: string;
  readonly queuedAtMs: number;
}

// Puts an action in the queue's tables as the queue holds it when it was queued at `queuedAtMs`, so a
// tool that reads the queue's time finds it. The test log has no task behind it, so the foreign
// keys are off.
export async function seedQueuedAction(
  log: Pick<Log, 'writer'>,
  facts: QueuedActionFacts,
): Promise<void> {
  await sql`pragma foreign_keys = off`.execute(log.writer.db);

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (900, ${facts.queuedAtMs}, 'action.queued', 'sha256:test', '{}')`.execute(log.writer.db);

  await sql`insert into actions (action_id, task_id, step_key, action_hash, tool, status,
    attempt_count, attempt_open, next_attempt_at, queued_sequence, updated_sequence, risk_class,
    is_approved, runs_in_step, unknown_streak, refused_count, is_runner)
    values (${facts.actionID}, 'task-1', 'step-1', 'hash-1', 'calendar.create_event', 'pending',
    0, 0, 0, 900, 900, 'write', 0, 0, 0, 0, 0)`.execute(log.writer.db);
}
