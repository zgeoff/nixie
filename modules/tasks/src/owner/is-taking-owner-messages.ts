import type { TaskRow } from '../types';

// The consolidator runs on its own schedule and reads no message of the user's, so only the
// conversation and a started task can take one moved to them.
export function isTakingOwnerMessages(
  task: Pick<TaskRow, 'is_conversation' | 'started_by'>,
): boolean {
  return task.is_conversation === 1 || task.started_by !== null;
}
