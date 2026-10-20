import type { LiveRecord } from './use-live-records';

// The conversation's failed turns in a row, and when it tries again.
export interface ConversationFailure {
  readonly errors: number;
  readonly retryAt: Date;
}

const stepEnds: ReadonlySet<string> = new Set([
  'task.step_committed',
  'task.step_errored',
  'task.revived',
]);

// Finds the conversation failing: its last step ended in an error at or past the error limit. A
// step that commits, or a revival, ends the failure, and an error under the limit is a retry the
// view leaves quiet.
export function findConversationFailure(
  records: readonly LiveRecord[],
): ConversationFailure | null {
  const last = records.findLast(
    (record) => record.task?.taskID === 'conversation' && stepEnds.has(record.kind),
  );

  const task = last?.kind === 'task.step_errored' ? last.task : undefined;

  if (
    task?.errors === undefined ||
    task.errorLimit === undefined ||
    task.retryAt === undefined ||
    task.errors < task.errorLimit
  ) {
    return null;
  }

  return { errors: task.errors, retryAt: task.retryAt };
}
