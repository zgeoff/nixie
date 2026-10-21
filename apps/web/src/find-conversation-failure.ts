import type { LiveRecord } from './use-live-records';

export interface ConversationFailure {
  readonly errors: number;
  readonly retryAt: Date;
}

const stepEnds: ReadonlySet<string> = new Set([
  'task.step_committed',
  'task.step_errored',
  'task.revived',
]);

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
