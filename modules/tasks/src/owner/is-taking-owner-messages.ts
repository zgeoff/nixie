import type { TaskRow } from '../types';

// Only the conversation and a started task can take a message moved to them.
export function isTakingOwnerMessages(
  task: Pick<TaskRow, 'is_conversation' | 'started_by'>,
): boolean {
  return task.is_conversation === 1 || task.started_by !== null;
}
