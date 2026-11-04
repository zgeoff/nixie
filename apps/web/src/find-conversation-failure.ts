import { formatFailureCause } from './format-failure-cause';
import type { LiveRecord } from './use-live-records';

export interface ConversationFailure {
  readonly errors: number;

  readonly cause: string | null;

  readonly retryAt: Date | null;
}

const stepEnds: ReadonlySet<string> = new Set([
  'task.step_committed',
  'task.step_errored',
  'task.revived',
]);

// A refused model call shows at once, because its cause is known and a retry may need the user; any
// other failure shows only once it repeats past the error limit.
export function findConversationFailure(
  records: readonly LiveRecord[],
): ConversationFailure | null {
  const last = records.findLast(
    (record) => record.task?.taskID === 'conversation' && stepEnds.has(record.kind),
  );

  const task = last?.kind === 'task.step_errored' ? last.task : undefined;
  const isWaitingForRetry = task?.isWaitingForRetry === true;

  if (task?.errors === undefined || (task.retryAt === undefined && !isWaitingForRetry)) {
    return null;
  }

  const cause = formatFailureCause(task.reason);
  const isPastLimit = task.errorLimit !== undefined && task.errors >= task.errorLimit;

  if (cause === null && !isPastLimit) {
    return null;
  }

  return { errors: task.errors, cause, retryAt: isWaitingForRetry ? null : (task.retryAt ?? null) };
}
