import type { Writer } from '@heynixie/log';
import type { ActionStatus, ActionsTables, OutcomeReason } from '../types';

export interface TestAction {
  readonly actionID: string;
  readonly taskID: string;
  readonly stepKey: string;
  readonly tool: string;
  readonly status: ActionStatus;
  readonly attemptCount: number;
  readonly isAttemptOpen: boolean;
  readonly nextAttemptAt: number;
  readonly reason: OutcomeReason | null;
  readonly outcomeSequence: number | null;
}

export async function readTestActions(writer: Pick<Writer, 'db'>): Promise<readonly TestAction[]> {
  const rows = await writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .selectAll()
    .orderBy('queued_sequence')
    .execute();

  return rows.map((row) => ({
    actionID: row.action_id,
    taskID: row.task_id,
    stepKey: row.step_key,
    tool: row.tool,
    status: row.status,
    attemptCount: row.attempt_count,
    isAttemptOpen: row.attempt_open === 1,
    nextAttemptAt: row.next_attempt_at,
    reason: row.reason,
    outcomeSequence: row.outcome_sequence,
  }));
}
