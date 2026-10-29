import type { TaskRow } from './types';

// The memory writer and consolidator run on their own schedule and read no message of the user's,
// so only the conversation and a started task can take one moved to them.
export function isTakingOwnerMessages(
  task: Pick<TaskRow, 'is_conversation' | 'started_by'>,
): boolean {
  return task.is_conversation === 1 || task.started_by !== null;
}
